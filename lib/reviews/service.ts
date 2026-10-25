import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getTeamTimezone } from "@/lib/team-timezone";
import { startOfDayUTC } from "@/lib/time";
import { notifyTaskCreated } from "@/lib/notifications";
import { reviewFingerprint } from "@/lib/listing-health/csv";
import { ListingHealthError, matchListing } from "@/lib/listing-health/service";
import { readAirbnbEmail } from "./airbnb-email";
import { firstName, OPEN_STAGES, sameGuest, stageAfter, taskFor, timedStage, type Stage, type StayAction } from "./pipeline";
import { DEFAULT_TEMPLATES, fillTemplate, TEMPLATE_META, type TemplateKey } from "./templates";

// Review pipeline: Airbnb emails → guest stays → one task per step →
// reviews. Every entry point is team-scoped. See lib/reviews/pipeline.ts for
// the stage rules.

type Listing = { id: string; airbnbListingId: string | null; airbnbUrl: string; internalName: string; listingName: string | null; clientId: string };

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const DAY = 86_400_000;

async function teamListings(teamId: string): Promise<Listing[]> {
  return prisma.propertyKnowledgeItem.findMany({
    where: { client: { teamId } },
    select: { id: true, airbnbListingId: true, airbnbUrl: true, internalName: true, listingName: true, clientId: true },
  });
}

/** Timeline entry. `at` is when it happened (the email's date for email events), not when we processed it. */
async function log(stayId: string, kind: string, detail?: string | null, actorId?: string | null, at?: Date) {
  await prisma.stayEvent.create({ data: { stayId, kind, detail: detail ?? null, actorId: actorId ?? null, ...(at ? { at } : {}) } });
}

/* -------------------------------------------------------------- templates */

export async function getTemplates(teamId: string) {
  const rows = await prisma.messageTemplate.findMany({ where: { teamId } });
  return (Object.keys(DEFAULT_TEMPLATES) as TemplateKey[]).map((key) => {
    const row = rows.find((r) => r.key === key);
    return { key, ...TEMPLATE_META[key], body: row?.body ?? DEFAULT_TEMPLATES[key], custom: !!row };
  });
}

export async function saveTemplate(teamId: string, key: string, body: string | null) {
  if (!(key in DEFAULT_TEMPLATES)) throw new ListingHealthError("Unknown template.");
  if (body === null) {
    await prisma.messageTemplate.deleteMany({ where: { teamId, key } });
    return;
  }
  const text = body.trim();
  if (!text || text.length > 3000) throw new ListingHealthError("Templates need 1 to 3000 characters.");
  await prisma.messageTemplate.upsert({ where: { teamId_key: { teamId, key } }, create: { teamId, key, body: text }, update: { body: text } });
}

/* ------------------------------------------------------------------ tasks */

const stayRef = (stayId: string, key: string) => `stay:${stayId}:${key}`;

/**
 * Keeps exactly the right open task for a stay's current stage: completes
 * any other open pipeline task for it and creates the one this stage needs.
 */
async function syncStayTask(stayId: string, actorId: string | null) {
  const stay = await prisma.guestStay.findUnique({ where: { id: stayId }, include: { property: true } });
  if (!stay) return;
  const want = taskFor(stay.stage as Stage, stay.rating);
  const open = await prisma.task.findMany({
    where: { teamId: stay.teamId, sourceRef: { startsWith: `stay:${stay.id}:` }, deletedAt: null, status: { not: "COMPLETED" } },
  });
  const stale = open.filter((t) => !want || t.sourceRef !== stayRef(stay.id, want.key));
  if (stale.length) {
    await prisma.task.updateMany({
      where: { id: { in: stale.map((t) => t.id) } },
      data: { status: "COMPLETED", completedAt: new Date(), completedBy: actorId },
    });
  }
  if (!want || open.some((t) => t.sourceRef === stayRef(stay.id, want.key))) return;
  // Don't recreate a step someone already completed (e.g. the follow-up task).
  const done = await prisma.task.findFirst({ where: { teamId: stay.teamId, sourceRef: stayRef(stay.id, want.key), deletedAt: null } });
  if (done) return;

  const templates = await getTemplates(stay.teamId);
  const listing = stay.property?.listingName ?? stay.property?.internalName ?? "your stay";
  const vars = { firstName: firstName(stay.guestName), listing };
  const tpl = (k: TemplateKey) => fillTemplate(templates.find((t) => t.key === k)!.body, vars);
  const steps: Record<string, string> = {
    "follow-up": `Send this in Airbnb (or Akia), then open the stay in Reviews and mark "Follow-up sent", or just complete this task.\n\n${tpl("FOLLOW_UP")}`,
    ask: `${firstName(stay.guestName)} was happy with the stay. 1) Leave them an honest review on Airbnb first. 2) Send this message, then complete this task (or mark "Request sent" in Reviews).

${tpl("REVIEW_REQUEST")}`,
    issue: `${stay.guestName} mentioned a problem${stay.issueNote ? `: ${stay.issueNote}` : ""}.\nFix it and reply to the guest, then mark the issue resolved in Reviews (or complete this task). The review request step comes after.\n\n${tpl("ISSUE_RECOVERY")}`,
    respond: `Post a short, calm public response on Airbnb (future guests read it), then complete this task. The listing page in Listing Health can draft one with AI.`,
  };
  const categories = await prisma.category.findMany({ where: { teamId: stay.teamId }, select: { id: true, name: true } });
  const category = categories.find((c) => /guest communication/i.test(c.name)) ?? categories.find((c) => /communication/i.test(c.name)) ?? null;
  const tz = await getTeamTimezone(stay.teamId);
  const task = await prisma.task.create({
    data: {
      teamId: stay.teamId,
      clientId: stay.property?.clientId ?? null,
      propertyName: stay.property?.internalName ?? null,
      categoryId: category?.id ?? null,
      title: `${stay.guestName} · ${stay.property?.internalName ?? "Airbnb stay"}: ${want.title}`.slice(0, 160),
      description: steps[want.key],
      notes: `Review pipeline: /reviews?stay=${stay.id}`,
      date: startOfDayUTC(new Date(), tz),
      priority: want.priority,
      status: "UPCOMING",
      sourceRef: stayRef(stay.id, want.key),
    },
    include: { client: true, assignedUser: true },
  });
  await notifyTaskCreated(stay.teamId, task, "Review pipeline").catch(() => {});
}

/** Called when someone completes a task on the board: advance the stay to match. */
export async function onStayTaskCompleted(teamId: string, sourceRef: string | null, actorId: string) {
  const m = sourceRef?.match(/^stay:([^:]+):(follow-up|issue|ask|respond)$/);
  if (!m) return;
  const [, stayId, key] = m;
  if (key === "follow-up") await applyStayAction(teamId, actorId, stayId, { action: "FOLLOW_UP_SENT" }).catch(() => {});
  if (key === "issue") await applyStayAction(teamId, actorId, stayId, { action: "ISSUE_RESOLVED" }).catch(() => {});
  if (key === "ask") await applyStayAction(teamId, actorId, stayId, { action: "REVIEW_REQUESTED" }).catch(() => {});
  if (key === "respond") {
    const stay = await prisma.guestStay.findFirst({ where: { id: stayId, teamId } });
    if (stay?.reviewId) await prisma.listingReview.updateMany({ where: { id: stay.reviewId, respondedAt: null }, data: { respondedAt: new Date() } });
    if (stay) await log(stay.id, "RESPONDED", null, actorId);
  }
}

/* ----------------------------------------------------------------- stages */

async function moveStay(stayId: string, to: Stage, actorId: string | null, extra: Prisma.GuestStayUpdateInput = {}, detail?: string, at?: Date) {
  await prisma.guestStay.update({ where: { id: stayId }, data: { ...extra, stage: to } });
  await log(stayId, to, detail, actorId, at);
  await syncStayTask(stayId, actorId);
}

/** Date-driven moves (checkout reached, window closed). Cheap; run on page loads. */
export async function advanceStays(teamId: string) {
  const tz = await getTeamTimezone(teamId);
  const today = startOfDayUTC(new Date(), tz);
  const candidates = await prisma.guestStay.findMany({
    where: { teamId, stage: { in: ["BOOKED", ...OPEN_STAGES] }, checkOut: { lte: today } },
    select: { id: true, stage: true, checkOut: true },
  });
  for (const s of candidates) {
    const next = timedStage(s, today);
    if (next) await moveStay(s.id, next, null);
  }
}

const actionSchema = z.object({
  action: z.enum(["FOLLOW_UP_SENT", "HAPPY", "ISSUE", "ISSUE_RESOLVED", "REVIEW_REQUESTED", "HOST_REVIEWED", "CLOSE"]),
  note: z.string().trim().max(1000).optional(),
});

export async function applyStayAction(teamId: string, actorId: string, stayId: string, raw: unknown) {
  const parsed = actionSchema.safeParse(raw);
  if (!parsed.success) throw new ListingHealthError("Unknown action.");
  const { action, note } = parsed.data;
  const stay = await prisma.guestStay.findFirst({ where: { id: stayId, teamId } });
  if (!stay) throw new ListingHealthError("Stay not found.", 404);
  const to = stageAfter(stay.stage as Stage, action as StayAction);
  if (!to) throw new ListingHealthError("That step doesn't apply to this stay right now.");
  const now = new Date();
  const extra: Prisma.GuestStayUpdateInput =
    action === "FOLLOW_UP_SENT"
      ? { followUpSentAt: now }
      : action === "HAPPY"
        ? { guestRepliedAt: stay.guestRepliedAt ?? now }
        : action === "ISSUE"
          ? { guestRepliedAt: stay.guestRepliedAt ?? now, issueNote: note || stay.issueNote }
          : action === "REVIEW_REQUESTED"
            ? { reviewRequestedAt: now, hostReviewedAt: stay.hostReviewedAt ?? now }
            : action === "HOST_REVIEWED"
              ? { hostReviewedAt: now }
              : {};
  if (action === "HOST_REVIEWED") {
    await prisma.guestStay.update({ where: { id: stay.id }, data: extra });
    await log(stay.id, "HOST_REVIEWED", note, actorId);
    return;
  }
  await moveStay(stay.id, to, actorId, extra, note ?? (action === "CLOSE" ? "Closed by the team" : undefined));
}

/* --------------------------------------------------------------- matching */

async function findStayForGuest(teamId: string, propertyId: string | null, guestName: string | null, around: Date, daysBack: number) {
  if (!guestName) return null;
  const candidates = await prisma.guestStay.findMany({
    where: {
      teamId,
      ...(propertyId ? { propertyId } : {}),
      stage: { not: "CANCELLED" },
      checkOut: { gte: new Date(around.getTime() - daysBack * DAY), lte: new Date(around.getTime() + 3 * DAY) },
    },
    orderBy: { checkOut: "desc" },
  });
  return candidates.find((s) => sameGuest(s.guestName, guestName)) ?? null;
}

/** Ties a saved review to its stay (any source) and moves the stay to REVIEWED. */
export async function linkReviewToStay(teamId: string, review: { id: string; propertyId: string; guestName: string | null; rating: number; reviewDate: Date | null }, actorId: string | null) {
  const stay = await findStayForGuest(teamId, review.propertyId, review.guestName, review.reviewDate ?? new Date(), 30);
  if (!stay || stay.stage === "REVIEWED") return null;
  await prisma.listingReview.update({ where: { id: review.id }, data: { stayId: stay.id } });
  await moveStay(stay.id, "REVIEWED", actorId, { rating: review.rating, reviewId: review.id, guestReviewedAt: new Date() }, `${review.rating}★`);
  return stay.id;
}

/* ------------------------------------------------------------ email ingest */

export type InboundMessage = { id: string; subject: string; from: string; date: string; body: string };

export async function ingestAirbnbEmails(teamId: string, messages: InboundMessage[]) {
  const settings = await prisma.teamSettings.findUnique({ where: { teamId }, select: { reviewInboxCreatedById: true } });
  const actorId = settings?.reviewInboxCreatedById ?? null;
  const tz = await getTeamTimezone(teamId);
  const listings = await teamListings(teamId);
  const seen = new Set(
    (await prisma.reviewInboxItem.findMany({ where: { teamId, externalId: { in: messages.map((m) => m.id) } }, select: { externalId: true } })).map((x) => x.externalId)
  );
  const result = { received: messages.length, duplicates: 0, stays: 0, reviews: 0, needsReview: 0, ignored: 0 };

  // Oldest first, so a confirmation is applied before its alteration/cancellation.
  const ordered = [...messages].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  for (const m of ordered) {
    if (seen.has(m.id)) {
      result.duplicates++;
      continue;
    }
    seen.add(m.id);
    const receivedAt = isNaN(Date.parse(m.date)) ? new Date() : new Date(m.date);
    const read = readAirbnbEmail({ subject: m.subject, from: m.from, body: m.body, date: receivedAt });
    const listing = matchListing(read.listingRef, listings) as Listing | null;
    const base = { teamId, externalId: m.id, subject: m.subject.slice(0, 500), fromAddress: m.from.slice(0, 300), receivedAt, kind: read.kind };

    if (read.kind === "OTHER") {
      // Not stored beyond the subject — keeps guest messages and other mail out of the app.
      await prisma.reviewInboxItem.create({ data: { ...base, body: "", status: "IGNORED" } });
      result.ignored++;
      continue;
    }

    let stayId: string | null = null;
    let status: "SAVED" | "NEEDS_REVIEW" = "SAVED";
    let propertyId = listing?.id ?? null;
    let reviewId: string | null = null;

    if (read.kind === "CONFIRMED" || read.kind === "ALTERED" || read.kind === "CANCELLED") {
      const existing = read.confirmationCode ? await prisma.guestStay.findUnique({ where: { teamId_confirmationCode: { teamId, confirmationCode: read.confirmationCode } } }) : null;
      if (!existing && !read.confirmationCode) {
        status = "NEEDS_REVIEW";
      } else if (!existing) {
        const stay = await prisma.guestStay.create({
          data: {
            teamId,
            confirmationCode: read.confirmationCode,
            guestName: read.guestName ?? "Guest",
            guests: read.guests,
            propertyId,
            checkIn: read.checkIn ? day(read.checkIn) : null,
            checkOut: read.checkOut ? day(read.checkOut) : null,
            stage: read.kind === "CANCELLED" ? "CANCELLED" : "BOOKED",
          },
        });
        await log(stay.id, read.kind === "CANCELLED" ? "CANCELLED" : read.kind === "ALTERED" ? "ALTERED" : "BOOKED", m.subject, null, receivedAt);
        stayId = stay.id;
        result.stays++;
      } else {
        stayId = existing.id;
        propertyId = propertyId ?? existing.propertyId;
        if (read.kind === "CANCELLED") {
          if (existing.stage !== "CANCELLED") await moveStay(existing.id, "CANCELLED", null, {}, m.subject, receivedAt);
        } else {
          const changes: string[] = [];
          const data: Prisma.GuestStayUpdateInput = {};
          if (read.checkIn && existing.checkIn?.toISOString().slice(0, 10) !== read.checkIn) {
            data.checkIn = day(read.checkIn);
            changes.push(`check-in ${existing.checkIn?.toISOString().slice(0, 10) ?? "?"} → ${read.checkIn}`);
          }
          if (read.checkOut && existing.checkOut?.toISOString().slice(0, 10) !== read.checkOut) {
            data.checkOut = day(read.checkOut);
            changes.push(`checkout ${existing.checkOut?.toISOString().slice(0, 10) ?? "?"} → ${read.checkOut}`);
          }
          if (read.guests && read.guests !== existing.guests) data.guests = read.guests;
          if (!existing.propertyId && listing) data.property = { connect: { id: listing.id } };
          if (Object.keys(data).length) await prisma.guestStay.update({ where: { id: existing.id }, data });
          await log(existing.id, read.kind === "ALTERED" ? "ALTERED" : "BOOKED", changes.join(", ") || m.subject, null, receivedAt);
          // An alteration that moves checkout back to the future reopens a "checked out" stay.
          if (read.kind === "ALTERED" && data.checkOut && existing.stage === "CHECKED_OUT" && day(read.checkOut!).getTime() > startOfDayUTC(new Date(), tz).getTime()) {
            await moveStay(existing.id, "BOOKED", null, {}, "Dates changed");
          }
        }
      }
    } else if (read.kind === "CHECKOUT") {
      const stay =
        (read.confirmationCode ? await prisma.guestStay.findUnique({ where: { teamId_confirmationCode: { teamId, confirmationCode: read.confirmationCode } } }) : null) ??
        (await findStayForGuest(teamId, propertyId, read.guestName, receivedAt, 5));
      if (stay) {
        stayId = stay.id;
        propertyId = propertyId ?? stay.propertyId;
        if (stay.stage === "BOOKED") await moveStay(stay.id, "CHECKED_OUT", null, { checkOut: stay.checkOut ?? startOfDayUTC(receivedAt, tz) }, "Airbnb asked us to review the guest", receivedAt);
      } else if (read.guestName) {
        // We never saw the booking: start tracking from checkout.
        const created = await prisma.guestStay.create({
          data: { teamId, guestName: read.guestName, propertyId, confirmationCode: read.confirmationCode, checkOut: startOfDayUTC(receivedAt, tz), stage: "BOOKED" },
        });
        stayId = created.id;
        result.stays++;
        await log(created.id, "BOOKED", "Started from Airbnb's review reminder", null, receivedAt);
        await moveStay(created.id, "CHECKED_OUT", null, {}, "Airbnb asked us to review the guest", receivedAt);
      } else status = "NEEDS_REVIEW";
      if (stayId && !propertyId) status = "NEEDS_REVIEW";
    } else {
      // GUEST_REVIEW
      const complete = !!(listing && read.rating && read.comment && actorId);
      if (complete) {
        const reviewDate = startOfDayUTC(receivedAt, tz);
        const fingerprint = reviewFingerprint({ rating: read.rating!, comment: read.comment, reviewDate });
        const review = await prisma.listingReview.upsert({
          where: { propertyId_fingerprint: { propertyId: listing!.id, fingerprint } },
          create: { propertyId: listing!.id, source: "EMAIL", rating: read.rating!, comment: read.comment, guestName: read.guestName, reviewDate, fingerprint, createdById: actorId! },
          update: {},
        });
        reviewId = review.id;
        stayId = await linkReviewToStay(teamId, review, null);
        result.reviews++;
      } else {
        status = "NEEDS_REVIEW";
        stayId = (await findStayForGuest(teamId, propertyId, read.guestName, receivedAt, 30))?.id ?? null;
      }
    }

    await prisma.reviewInboxItem.create({
      data: { ...base, body: m.body.slice(0, 60_000), status, propertyId, reviewId, stayId, parsed: read as unknown as Prisma.InputJsonValue },
    });
    if (status === "NEEDS_REVIEW") result.needsReview++;
  }
  await prisma.teamSettings.update({ where: { teamId }, data: { reviewInboxLastSeenAt: new Date() } }).catch(() => {});
  await advanceStays(teamId);
  return result;
}

/* ----------------------------------------------------------------- manual */

const staySchema = z.object({
  guestName: z.string().trim().min(1, "Add the guest's name.").max(80),
  propertyId: z.string().min(1, "Pick the listing."),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Add the checkout date."),
  confirmationCode: z
    .string()
    .trim()
    .regex(/^HM[A-Z0-9]{8}$/i, "Confirmation codes look like HMABCD1234.")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
});

/** Add a stay by hand (e.g. a booking from before email sync was set up). */
export async function createStay(teamId: string, actorId: string, raw: unknown) {
  const parsed = staySchema.safeParse(raw);
  if (!parsed.success) throw new ListingHealthError(parsed.error.issues[0]?.message ?? "Check the fields.");
  const d = parsed.data;
  const listing = await prisma.propertyKnowledgeItem.findFirst({ where: { id: d.propertyId, client: { teamId } } });
  if (!listing) throw new ListingHealthError("Listing not found.", 404);
  try {
    const stay = await prisma.guestStay.create({
      data: {
        teamId,
        guestName: d.guestName,
        propertyId: listing.id,
        confirmationCode: d.confirmationCode?.toUpperCase() ?? null,
        checkIn: d.checkIn ? day(d.checkIn) : null,
        checkOut: day(d.checkOut),
      },
    });
    await log(stay.id, "BOOKED", "Added by hand", actorId);
    await advanceStays(teamId);
    return stay;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new ListingHealthError("A stay with that confirmation code already exists.", 409);
    throw err;
  }
}

const reviewEditSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().trim().min(1).max(5000).optional(),
  guestName: z.string().trim().max(80).nullable().optional(),
  privateNote: z.string().trim().max(5000).nullable().optional(),
  responded: z.boolean().optional(),
});

/** Edit a saved review (fix a misread rating, mark the public response posted). */
export async function updateReview(teamId: string, reviewId: string, raw: unknown) {
  const parsed = reviewEditSchema.safeParse(raw);
  if (!parsed.success) throw new ListingHealthError(parsed.error.issues[0]?.message ?? "Check the fields.");
  const review = await prisma.listingReview.findFirst({ where: { id: reviewId, property: { client: { teamId } } } });
  if (!review) throw new ListingHealthError("Review not found.", 404);
  const { responded, ...rest } = parsed.data;
  const data: Prisma.ListingReviewUpdateInput = { ...rest };
  if (responded !== undefined) data.respondedAt = responded ? review.respondedAt ?? new Date() : null;
  if (rest.rating !== undefined || rest.comment !== undefined) {
    data.fingerprint = reviewFingerprint({ rating: rest.rating ?? review.rating, comment: rest.comment ?? review.comment, reviewDate: review.reviewDate });
  }
  try {
    const updated = await prisma.listingReview.update({ where: { id: review.id }, data });
    if (updated.stayId && rest.rating !== undefined) {
      await prisma.guestStay.update({ where: { id: updated.stayId }, data: { rating: updated.rating } });
      await syncStayTask(updated.stayId, null);
    }
    if (responded && updated.stayId) {
      await prisma.task.updateMany({
        where: { teamId, sourceRef: stayRef(updated.stayId, "respond"), status: { not: "COMPLETED" }, deletedAt: null },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    }
    return updated;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new ListingHealthError("An identical review is already saved for this listing.", 409);
    throw err;
  }
}
