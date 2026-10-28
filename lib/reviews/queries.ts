import { prisma } from "@/lib/prisma";
import { getTeamTimezone } from "@/lib/team-timezone";
import { startOfDayUTC } from "@/lib/time";
import { listInbox } from "@/lib/listing-health/inbox";
import { isAiReady } from "@/lib/ai/client";
import { daysLeft, firstName } from "./pipeline";
import { getTemplates } from "./service";
import { byListingIn, inSquad, type Scope } from "@/lib/scope";

const DAY = 86_400_000;
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

export async function getReviewHub(scope: Scope) {
  const { teamId } = scope;
  const staysIn = byListingIn(scope);
  const tz = await getTeamTimezone(teamId);
  const today = startOfDayUTC(new Date(), tz);
  const since90 = new Date(today.getTime() - 90 * DAY);

  const [stays, reviews, inbox, templates, listings, aiReady, clients] = await Promise.all([
    prisma.guestStay.findMany({
      where: {
        teamId,
        AND: [staysIn, { OR: [{ stage: { in: ["BOOKED", "CHECKED_OUT", "FOLLOW_UP_SENT", "ISSUE", "ASK_REVIEW", "REVIEW_REQUESTED"] } }, { updatedAt: { gte: new Date(today.getTime() - 30 * DAY) } }] }],
      },
      include: { property: { select: { id: true, internalName: true, listingName: true, airbnbUrl: true } }, events: { orderBy: { at: "desc" }, take: 20 } },
      orderBy: [{ checkOut: "asc" }],
      take: 400,
    }),
    prisma.listingReview.findMany({
      where: { property: { client: inSquad(scope) } },
      include: { property: { select: { id: true, internalName: true, clientId: true } } },
      orderBy: [{ reviewDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 400,
    }),
    listInbox(teamId),
    getTemplates(teamId),
    prisma.propertyKnowledgeItem.findMany({ where: { client: inSquad(scope) }, select: { id: true, internalName: true, clientId: true }, orderBy: { internalName: "asc" } }),
    isAiReady(teamId),
    prisma.client.findMany({ where: { ...inSquad(scope), active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  // KPIs over the last 90 days of reviews / checked-out stays.
  const recent = reviews.filter((r) => (r.reviewDate ?? r.createdAt) >= since90);
  const fiveStar = recent.filter((r) => r.rating === 5).length;
  const closed90 = await prisma.guestStay.groupBy({
    by: ["stage"],
    where: { teamId, ...staysIn, checkOut: { gte: since90, lte: today }, stage: { in: ["REVIEWED", "EXPIRED"] } },
    _count: { _all: true },
  });
  const reviewed = closed90.find((c) => c.stage === "REVIEWED")?._count._all ?? 0;
  const expired = closed90.find((c) => c.stage === "EXPIRED")?._count._all ?? 0;
  const asked = await prisma.guestStay.findMany({ where: { teamId, ...staysIn, reviewRequestedAt: { gte: since90 }, stage: "REVIEWED" }, select: { rating: true } });

  return {
    today: iso(today)!,
    aiReady,
    clients,
    listings: listings.map((l) => ({ id: l.id, name: l.internalName, clientId: l.clientId })),
    kpis: {
      reviews90: recent.length,
      average: recent.length ? recent.reduce((s, r) => s + r.rating, 0) / recent.length : null,
      fiveStarShare: recent.length ? fiveStar / recent.length : null,
      reviewRate: reviewed + expired ? reviewed / (reviewed + expired) : null,
      askedFiveStarShare: asked.length ? asked.filter((a) => a.rating === 5).length / asked.length : null,
      askedCount: asked.length,
      needsResponse: reviews.filter((r) => r.rating < 5 && !r.respondedAt).length,
    },
    stays: stays.map((s) => ({
      id: s.id,
      guestName: s.guestName,
      firstName: firstName(s.guestName),
      confirmationCode: s.confirmationCode,
      guests: s.guests,
      stage: s.stage,
      checkIn: iso(s.checkIn),
      checkOut: iso(s.checkOut),
      daysLeft: daysLeft(s.checkOut, today),
      issueNote: s.issueNote,
      rating: s.rating,
      followUpSentAt: s.followUpSentAt?.toISOString() ?? null,
      reviewRequestedAt: s.reviewRequestedAt?.toISOString() ?? null,
      hostReviewedAt: s.hostReviewedAt?.toISOString() ?? null,
      listing: s.property ? { id: s.property.id, name: s.property.internalName, title: s.property.listingName ?? s.property.internalName, url: s.property.airbnbUrl } : null,
      events: s.events.map((e) => ({ id: e.id, kind: e.kind, detail: e.detail, at: e.at.toISOString() })),
    })),
    reviews: reviews.map((r) => ({
      id: r.id,
      propertyId: r.property.id,
      listing: r.property.internalName,
      clientId: r.property.clientId,
      source: r.source,
      rating: r.rating,
      guestName: r.guestName,
      comment: r.comment,
      privateNote: r.privateNote,
      reviewDate: iso(r.reviewDate) ?? iso(r.createdAt),
      responded: !!r.respondedAt,
      stayId: r.stayId,
    })),
    inbox,
    templates,
  };
}

export type ReviewHub = Awaited<ReturnType<typeof getReviewHub>>;
