// Server-side ONLY. Everything the client portal shows comes from here, and
// every query uses an explicit `select`: a new column on a listing or review
// is invisible to owners until someone adds it below on purpose.
//
// Never shown to an owner: door codes and Wi-Fi passwords (an owner account
// is one more password that can leak; they ask the team instead), internal
// notes, AI notes, staff names, tasks, guest private feedback, other clients.
import { prisma } from "@/lib/prisma";
import type { Issue } from "@/lib/listing-health/score";
import type { PortalUser } from "./session";
import { hideCodes } from "./rules";

const LISTING = {
  id: true,
  internalName: true,
  listingName: true,
  airbnbUrl: true,
  propertyType: true,
  location: true,
  guestCapacity: true,
  bedrooms: true,
  bathrooms: true,
  beds: true,
} as const;

const SNAPSHOT = {
  fetchedAt: true,
  rating: true,
  reviewCount: true,
  healthScore: true,
  cleanliness: true,
  accuracy: true,
  checkin: true,
  communication: true,
  location: true,
  value: true,
  guestFavorite: true,
  superhost: true,
  photoCount: true,
  issues: true,
} as const;

const REVIEW = { id: true, reviewDate: true, rating: true, guestName: true, comment: true, respondedAt: true, propertyId: true } as const;

/** Only the owner's own client, always. */
const mine = (owner: PortalUser) => ({ clientId: owner.clientId, client: { teamId: owner.teamId } });

function issuesOf(raw: unknown) {
  // Severity and title only: what we'd fix, without internal wording about
  // tasks or who does it.
  return ((raw as Issue[] | null) ?? []).map((i) => ({ severity: i.severity, title: i.title }));
}

export async function portalOverview(owner: PortalUser) {
  const since90 = new Date(Date.now() - 90 * 86_400_000);
  const [listings, reviews, requests] = await Promise.all([
    prisma.propertyKnowledgeItem.findMany({
      where: mine(owner),
      select: { ...LISTING, healthSnapshots: { where: { ok: true }, orderBy: { fetchedAt: "desc" }, take: 2, select: SNAPSHOT } },
      orderBy: { internalName: "asc" },
    }),
    prisma.listingReview.findMany({
      where: { property: mine(owner) },
      select: { ...REVIEW, property: { select: { internalName: true, listingName: true } } },
      orderBy: [{ reviewDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 200,
    }),
    prisma.clientRequest.findMany({
      where: { clientId: owner.clientId, teamId: owner.teamId },
      select: { id: true, kind: true, message: true, status: true, createdAt: true, resolvedAt: true, propertyId: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  const recent = reviews.filter((r) => (r.reviewDate ?? new Date(0)) >= since90);
  return {
    listings: listings.map(({ healthSnapshots: [now, before], ...l }) => ({
      ...l,
      health: now ? { ...now, issues: issuesOf(now.issues), trend: before?.healthScore != null && now.healthScore != null ? now.healthScore - before.healthScore : null } : null,
    })),
    reviews: reviews.map((r) => ({ ...r, comment: hideCodes(r.comment) ?? "" })),
    requests,
    kpis: {
      reviews90: recent.length,
      average90: recent.length ? recent.reduce((s, r) => s + r.rating, 0) / recent.length : null,
      fiveStar90: recent.length ? recent.filter((r) => r.rating === 5).length / recent.length : null,
      responded90: recent.length ? recent.filter((r) => r.respondedAt).length / recent.length : null,
    },
  };
}

export async function portalListing(owner: PortalUser, propertyId: string) {
  const listing = await prisma.propertyKnowledgeItem.findFirst({
    where: { id: propertyId, ...mine(owner) },
    select: {
      ...LISTING,
      description: true,
      amenities: true,
      rules: true,
      checkInInfo: true,
      checkoutInfo: true,
      parkingInfo: true,
      wifiName: true,
      // Presence only: the owner sees that a code is on file, never the code.
      wifiPassword: true,
      doorCode: true,
      updatedAt: true,
      healthSnapshots: { where: { ok: true }, orderBy: { fetchedAt: "desc" }, take: 12, select: SNAPSHOT },
      reviews: { select: REVIEW, orderBy: [{ reviewDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }], take: 200 },
    },
  });
  if (!listing) return null;
  const { wifiPassword, doorCode, healthSnapshots, reviews, ...rest } = listing;
  return {
    ...rest,
    // Codes typed into the free text are hidden too, not just the code fields.
    description: hideCodes(rest.description),
    rules: hideCodes(rest.rules),
    checkInInfo: hideCodes(rest.checkInInfo),
    checkoutInfo: hideCodes(rest.checkoutInfo),
    parkingInfo: hideCodes(rest.parkingInfo),
    reviews: reviews.map((r) => ({ ...r, comment: hideCodes(r.comment) ?? "" })),
    hasWifiPassword: !!wifiPassword,
    hasDoorCode: !!doorCode,
    health: healthSnapshots[0] ? { ...healthSnapshots[0], issues: issuesOf(healthSnapshots[0].issues) } : null,
    history: healthSnapshots.map((s) => ({ fetchedAt: s.fetchedAt, healthScore: s.healthScore, rating: s.rating })).reverse(),
  };
}
