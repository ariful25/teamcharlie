import { createHash, randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AiError, isAiReady, runAi } from "@/lib/ai/client";
import { extractJson } from "@/lib/ai/providers";
import { reviewFingerprint } from "./csv";
import { ListingHealthError, matchListing } from "./service";
import { parsePastedReviews, type TextReview } from "./review-text";
import { createStay, linkReviewToStay } from "@/lib/reviews/service";
import { redactCodes } from "./ai";

// Two ways reviews get in without an API:
//  1. Paste: text copied from Airbnb's Reviews page → preview → save.
//  2. Email sync: a Google Apps Script in the team's Gmail posts Airbnb
//     "new review" emails to /api/inbound/reviews with a per-team token.
// Both end in ListingReview rows (source PASTE / EMAIL) and share the same
// duplicate guard as CSV imports.

type Listing = { id: string; airbnbListingId: string | null; airbnbUrl: string; internalName: string; listingName: string | null };

/** A client's listings, or every listing in the team when no client is given. */
async function clientListings(teamId: string, clientId?: string | null) {
  if (clientId) {
    const client = await prisma.client.findFirst({ where: { id: clientId, teamId } });
    if (!client) throw new ListingHealthError("Client not found.", 404);
  }
  return prisma.propertyKnowledgeItem.findMany({
    where: clientId ? { clientId } : { client: { teamId } },
    select: { id: true, airbnbListingId: true, airbnbUrl: true, internalName: true, listingName: true },
  });
}

/* ------------------------------------------------------------------ paste */

const AI_CHUNK = 12_000;

/** Splits on blank lines so a review is never cut in half between AI calls. */
function chunks(text: string) {
  const parts: string[] = [];
  let cur = "";
  for (const para of text.split(/\n\s*\n/)) {
    if (cur.length + para.length > AI_CHUNK && cur) {
      parts.push(cur);
      cur = "";
    }
    cur += (cur ? "\n\n" : "") + para;
  }
  if (cur.trim()) parts.push(cur);
  return parts.slice(0, 8);
}

async function readWithAi(teamId: string, userId: string, text: string): Promise<TextReview[]> {
  const out: TextReview[] = [];
  for (const part of chunks(redactCodes(text) ?? "")) {
    const result = await runAi({
      teamId,
      userId,
      feature: "listing-health:read-reviews",
      maxTokens: 6000,
      system:
        "You extract guest reviews from text a short-term-rental host copied from Airbnb. Copy review wording exactly; never invent a rating; use null when the text doesn't state one. Reply with JSON only.",
      prompt: `Text:\n"""\n${part}\n"""\n\nReturn {"reviews": [{"guestName": string|null, "reviewDate": "yyyy-MM-dd"|null, "rating": 1-5|null, "comment": string, "privateNote": string|null, "listingRef": string|null}]}.\nSkip the host's own responses and page interface text. "listingRef" is the listing title or Airbnb room id if the text shows which listing the review is for.`,
    });
    const json = extractJson<{ reviews?: TextReview[] }>(result.text);
    for (const r of json?.reviews ?? []) {
      if (!r?.comment || typeof r.comment !== "string") continue;
      const rating = Number(r.rating);
      out.push({
        guestName: typeof r.guestName === "string" ? r.guestName.slice(0, 80) : null,
        reviewDate: typeof r.reviewDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.reviewDate) ? r.reviewDate : null,
        rating: rating >= 1 && rating <= 5 ? Math.round(rating) : null,
        comment: r.comment.slice(0, 5000),
        privateNote: typeof r.privateNote === "string" ? r.privateNote.slice(0, 5000) : null,
        listingRef: typeof r.listingRef === "string" ? r.listingRef.slice(0, 200) : null,
      });
    }
  }
  return out;
}

export async function readPastedReviews(input: { teamId: string; userId: string; clientId?: string | null; propertyId?: string | null; text: string; useAi: boolean }) {
  const listings = await clientListings(input.teamId, input.clientId);
  if (input.propertyId && !listings.some((l) => l.id === input.propertyId)) throw new ListingHealthError("Listing not found.", 404);
  if (input.text.length > 200_000) throw new ListingHealthError("That's too much text at once. Paste up to about 100 reviews.");

  let method: "ai" | "text" = "text";
  let reviews: TextReview[] = [];
  if (input.useAi && (await isAiReady(input.teamId))) {
    try {
      reviews = await readWithAi(input.teamId, input.userId, input.text);
      method = "ai";
    } catch (err) {
      if (!(err instanceof AiError)) throw err;
      // Fall back to the built-in reader rather than failing the paste.
    }
  }
  if (method === "text" || reviews.length === 0) {
    reviews = parsePastedReviews(input.text);
    method = "text";
  }
  return {
    method,
    rows: reviews.map((r) => ({
      ...r,
      propertyId: input.propertyId ?? matchListing(r.listingRef, listings)?.id ?? null,
    })),
  };
}

const rowSchema = z.object({
  propertyId: z.string().min(1, "Pick a listing for every review."),
  rating: z.number().int().min(1, "Every review needs a star rating.").max(5),
  comment: z.string().trim().min(1).max(5000),
  guestName: z.string().trim().max(80).nullable().optional(),
  reviewDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  privateNote: z.string().trim().max(5000).nullable().optional(),
});

export async function savePastedReviews(input: { teamId: string; actorId: string; clientId?: string | null; rows: unknown[] }) {
  const listings = await clientListings(input.teamId, input.clientId);
  const ids = new Set(listings.map((l) => l.id));
  if (!Array.isArray(input.rows) || input.rows.length === 0) throw new ListingHealthError("Nothing to save.");
  if (input.rows.length > 300) throw new ListingHealthError("Save up to 300 reviews at a time.");
  const data: Prisma.ListingReviewCreateManyInput[] = [];
  for (const raw of input.rows) {
    const parsed = rowSchema.safeParse(raw);
    if (!parsed.success) throw new ListingHealthError(parsed.error.issues[0]?.message ?? "Check the reviews before saving.");
    const r = parsed.data;
    if (!ids.has(r.propertyId)) throw new ListingHealthError("A review points at a listing outside this client.");
    const reviewDate = r.reviewDate ? new Date(`${r.reviewDate}T00:00:00Z`) : null;
    data.push({
      propertyId: r.propertyId,
      source: "PASTE",
      rating: r.rating,
      comment: r.comment,
      guestName: r.guestName || null,
      privateNote: r.privateNote || null,
      reviewDate,
      fingerprint: reviewFingerprint({ rating: r.rating, comment: r.comment, reviewDate }),
      createdById: input.actorId,
    });
  }
  const created = await prisma.listingReview.createMany({ data, skipDuplicates: true });
  // Tie each new review to its guest's stay in the review pipeline, if tracked.
  const saved = await prisma.listingReview.findMany({
    where: { createdById: input.actorId, source: "PASTE", stayId: null, fingerprint: { in: data.map((d) => d.fingerprint) } },
  });
  for (const r of saved) await linkReviewToStay(input.teamId, r, input.actorId);
  return { saved: created.count, duplicates: data.length - created.count };
}

/* ------------------------------------------------------------- email sync */

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Creates (or replaces) the team's sync token. The plain token is returned once. */
export async function rotateInboxToken(teamId: string, actorId: string) {
  const token = `thq_rev_${randomBytes(24).toString("base64url")}`;
  await prisma.teamSettings.upsert({
    where: { teamId },
    create: { teamId, reviewInboxTokenHash: hash(token), reviewInboxTokenHint: token.slice(-4), reviewInboxCreatedById: actorId },
    update: { reviewInboxTokenHash: hash(token), reviewInboxTokenHint: token.slice(-4), reviewInboxCreatedById: actorId },
  });
  return token;
}

export async function disableInbox(teamId: string) {
  await prisma.teamSettings.update({ where: { teamId }, data: { reviewInboxTokenHash: null, reviewInboxTokenHint: null } });
}

export async function inboxStatus(teamId: string) {
  const [settings, counts] = await Promise.all([
    prisma.teamSettings.findUnique({ where: { teamId }, select: { reviewInboxTokenHint: true, reviewInboxLastSeenAt: true } }),
    prisma.reviewInboxItem.groupBy({ by: ["status"], where: { teamId }, _count: { _all: true } }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  return {
    connected: !!settings?.reviewInboxTokenHint,
    tokenHint: settings?.reviewInboxTokenHint ?? null,
    lastSeenAt: settings?.reviewInboxLastSeenAt?.toISOString() ?? null,
    saved: count("SAVED"),
    needsReview: count("NEEDS_REVIEW"),
    ignored: count("IGNORED"),
  };
}

export const inboundSchema = z.object({
  messages: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        subject: z.string().max(500),
        from: z.string().max(300),
        date: z.string().max(60),
        body: z.string().max(60_000),
      })
    )
    .max(100),
});

export async function teamForToken(token: string | null) {
  if (!token || !token.startsWith("thq_rev_")) return null;
  const s = await prisma.teamSettings.findUnique({ where: { reviewInboxTokenHash: hash(token) }, select: { teamId: true } });
  return s?.teamId ?? null;
}

/* ------------------------------------------------------------ inbox items */

export async function listInbox(teamId: string, clientId?: string) {
  const items = await prisma.reviewInboxItem.findMany({
    where: { teamId, status: "NEEDS_REVIEW" },
    orderBy: { receivedAt: "desc" },
    take: 50,
  });
  return items.map((i) => {
    const p = (i.parsed ?? {}) as Partial<TextReview>;
    return {
      id: i.id,
      kind: i.kind,
      subject: i.subject,
      receivedAt: i.receivedAt.toISOString(),
      snippet: i.body.replace(/\s+/g, " ").slice(0, 400),
      propertyId: i.propertyId,
      guestName: p.guestName ?? null,
      rating: p.rating ?? null,
      comment: p.comment ?? "",
      link: i.body.match(/https:\/\/(?:www\.)?airbnb\.[a-z.]+\/[^\s>)"]+/i)?.[0] ?? null,
      clientId: clientId ?? null,
    };
  });
}

const resolveSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("IGNORE") }),
  z.object({ action: z.literal("STAY"), guestName: z.string(), propertyId: z.string(), checkOut: z.string(), checkIn: z.string().nullable().optional(), confirmationCode: z.string().nullable().optional() }),
  z.object({
    action: z.literal("SAVE"),
    propertyId: z.string().min(1, "Pick the listing."),
    rating: z.number().int().min(1, "Pick a star rating.").max(5),
    comment: z.string().trim().min(1, "Add the review text.").max(5000),
    guestName: z.string().trim().max(80).nullable().optional(),
  }),
]);

export async function resolveInboxItem(teamId: string, actorId: string, id: string, raw: unknown) {
  const item = await prisma.reviewInboxItem.findFirst({ where: { id, teamId } });
  if (!item) throw new ListingHealthError("Inbox item not found.", 404);
  const parsed = resolveSchema.safeParse(raw);
  if (!parsed.success) throw new ListingHealthError(parsed.error.issues[0]?.message ?? "Check the fields.");
  if (parsed.data.action === "IGNORE") {
    await prisma.reviewInboxItem.update({ where: { id }, data: { status: "IGNORED" } });
    return { ok: true };
  }
  if (parsed.data.action === "STAY") {
    const { action: _a, ...fields } = parsed.data;
    const stay = await createStay(teamId, actorId, fields);
    await prisma.reviewInboxItem.update({ where: { id }, data: { status: "SAVED", stayId: stay.id, propertyId: stay.propertyId } });
    return { ok: true };
  }
  const d = parsed.data;
  const listing = await prisma.propertyKnowledgeItem.findFirst({ where: { id: d.propertyId, client: { teamId } } });
  if (!listing) throw new ListingHealthError("Listing not found.", 404);
  const reviewDate = new Date(`${item.receivedAt.toISOString().slice(0, 10)}T00:00:00Z`);
  const fingerprint = reviewFingerprint({ rating: d.rating, comment: d.comment, reviewDate });
  const review = await prisma.listingReview.upsert({
    where: { propertyId_fingerprint: { propertyId: listing.id, fingerprint } },
    create: { propertyId: listing.id, source: "EMAIL", rating: d.rating, comment: d.comment, guestName: d.guestName || null, reviewDate, fingerprint, createdById: actorId },
    update: {},
  });
  await prisma.reviewInboxItem.update({ where: { id }, data: { status: "SAVED", propertyId: listing.id, reviewId: review.id } });
  await linkReviewToStay(teamId, review, actorId);
  return { ok: true };
}
