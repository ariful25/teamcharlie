import type { ListingHealthSnapshot } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CategoryKey } from "./parse";
import { CATEGORY_LABEL, missingAmenities, starCounts, type Issue } from "./score";
import { analyzeReviews, starBuckets, themesOf } from "./reviews";
import { isAiReady } from "@/lib/ai/client";
import { templateCheckinGuide } from "./ai";

// Read side of Listing Health — plain JSON for client components.

const CATEGORIES: CategoryKey[] = ["cleanliness", "accuracy", "checkin", "communication", "location", "value"];
type Shares = Record<"5" | "4" | "3" | "2" | "1", number>;

export type SnapshotView = {
  fetchedAt: string;
  ok: boolean;
  error: string | null;
  rating: number | null;
  reviewCount: number | null;
  categories: Record<CategoryKey, number | null>;
  starShares: Shares | null;
  estimatedStars: Shares | null;
  reviewTags: { name: string; count: number }[];
  guestFavorite: boolean;
  photoCount: number | null;
  genericCaptions: number | null;
  descriptionLength: number | null;
  amenities: string[];
  healthScore: number | null;
  qualityScore: number | null;
  issues: Issue[];
};

function view(s: ListingHealthSnapshot): SnapshotView {
  const starShares = (s.starShares as Shares | null) ?? null;
  return {
    fetchedAt: s.fetchedAt.toISOString(),
    ok: s.ok,
    error: s.error,
    rating: s.rating,
    reviewCount: s.reviewCount,
    categories: Object.fromEntries(CATEGORIES.map((c) => [c, s[c]])) as Record<CategoryKey, number | null>,
    starShares,
    estimatedStars: starCounts({ starShares, reviewCount: s.reviewCount }),
    reviewTags: ((s.reviewTags as { name: string; count: number }[] | null) ?? []).slice().sort((a, b) => b.count - a.count),
    guestFavorite: s.guestFavorite,
    photoCount: s.photoCount,
    genericCaptions: s.genericCaptions,
    descriptionLength: s.descriptionLength,
    amenities: s.amenities,
    healthScore: s.healthScore,
    qualityScore: s.qualityScore,
    issues: (s.issues as Issue[] | null) ?? [],
  };
}

/** Latest snapshot per listing (and the one before, for the trend arrow). */
async function latestSnapshots(propertyIds: string[]) {
  const rows = await prisma.listingHealthSnapshot.findMany({
    where: { propertyId: { in: propertyIds } },
    orderBy: { fetchedAt: "desc" },
  });
  const latest = new Map<string, ListingHealthSnapshot>();
  const previousRating = new Map<string, number | null>();
  for (const r of rows) {
    if (!latest.has(r.propertyId)) latest.set(r.propertyId, r);
    else if (!previousRating.has(r.propertyId) && r.ok) previousRating.set(r.propertyId, r.rating);
  }
  return { latest, previousRating };
}

export type PortfolioRow = {
  id: string;
  internalName: string;
  listingName: string | null;
  airbnbUrl: string;
  snapshot: SnapshotView | null;
  previousRating: number | null;
  imported: { total: number; low: number; byStar: Record<1 | 2 | 3 | 4 | 5, number> };
};

export async function getPortfolio(teamId: string, clientId: string) {
  const client = await prisma.client.findFirst({ where: { id: clientId, teamId }, select: { id: true, name: true } });
  if (!client) return null;
  const listings = await prisma.propertyKnowledgeItem.findMany({
    where: { clientId },
    select: { id: true, internalName: true, listingName: true, airbnbUrl: true },
    orderBy: { internalName: "asc" },
  });
  const ids = listings.map((l) => l.id);
  const [{ latest, previousRating }, reviews] = await Promise.all([
    latestSnapshots(ids),
    prisma.listingReview.findMany({ where: { propertyId: { in: ids } }, select: { propertyId: true, rating: true, comment: true, privateNote: true } }),
  ]);

  const rows: PortfolioRow[] = listings.map((l) => {
    const mine = reviews.filter((r) => r.propertyId === l.id);
    const byStar = starBuckets(mine);
    const snap = latest.get(l.id);
    return {
      ...l,
      snapshot: snap ? view(snap) : null,
      previousRating: previousRating.get(l.id) ?? null,
      imported: { total: mine.length, low: byStar[1] + byStar[2] + byStar[3] + byStar[4], byStar },
    };
  });

  // Portfolio aggregates over listings that have a readable snapshot.
  const checked = rows.filter((r) => r.snapshot?.ok);
  const rated = checked.filter((r) => r.snapshot!.rating !== null);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const categoryAverages = CATEGORIES.map((c) => ({
    key: c,
    label: CATEGORY_LABEL[c],
    average: avg(rated.map((r) => r.snapshot!.categories[c]).filter((v): v is number => v !== null)),
    below48: rated.filter((r) => (r.snapshot!.categories[c] ?? 5) < 4.8).length,
  })).sort((a, b) => (a.average ?? 5) - (b.average ?? 5));

  const issueCounts = new Map<string, { code: string; title: string; severity: Issue["severity"]; listings: number; action: string }>();
  for (const r of rows) {
    for (const i of r.snapshot?.issues ?? []) {
      const key = i.code;
      const label = i.code.startsWith("CATEGORY_") ? `${i.title.replace(/\s[\d.]+$/, "")} below 4.8` : genericIssueTitle(i);
      const entry = issueCounts.get(key) ?? { code: key, title: label, severity: i.severity, listings: 0, action: i.action };
      entry.listings++;
      issueCounts.set(key, entry);
    }
  }

  const estLow = rated.reduce(
    (acc, r) => {
      const e = r.snapshot!.estimatedStars;
      if (e) {
        acc[4] += e["4"];
        acc[3] += e["3"];
        acc[2] += e["2"];
        acc[1] += e["1"];
      }
      return acc;
    },
    { 4: 0, 3: 0, 2: 0, 1: 0 } as Record<1 | 2 | 3 | 4, number>
  );

  return {
    client,
    rows,
    summary: {
      listings: rows.length,
      checked: checked.length,
      unreachable: rows.filter((r) => r.snapshot && !r.snapshot.ok).length,
      neverChecked: rows.filter((r) => !r.snapshot).length,
      averageRating: avg(rated.map((r) => r.snapshot!.rating!)),
      averageHealth: avg(rated.map((r) => r.snapshot!.healthScore).filter((v): v is number => v !== null)),
      averageQuality: avg(checked.map((r) => r.snapshot!.qualityScore).filter((v): v is number => v !== null)),
      below48: rated.filter((r) => r.snapshot!.rating! < 4.8).length,
      guestFavorites: checked.filter((r) => r.snapshot!.guestFavorite).length,
      totalReviews: rated.reduce((s, r) => s + (r.snapshot!.reviewCount ?? 0), 0),
      estimatedLowStars: estLow,
      categoryAverages,
      topIssues: [...issueCounts.values()].sort((a, b) => b.listings - a.listings).slice(0, 8),
      importedReviews: reviews.length,
      themes: analyzeReviews(reviews).slice(0, 8),
    },
  };
}

function genericIssueTitle(i: Issue) {
  switch (i.code) {
    case "RATING_LOW": return "Rating below 4.8";
    case "RATING_DROP": return "Rating dropped since last check";
    case "LOW_STAR_SHARE": return "5%+ of reviews are 3★ or lower";
    case "FEW_REVIEWS": return "Fewer than 10 reviews";
    case "FEW_PHOTOS": return "Fewer than 20 photos";
    case "GENERIC_CAPTIONS": return "Photos without real captions";
    case "SHORT_TITLE": return "Title under 30 characters";
    case "SHORT_DESCRIPTION": return "Short description";
    case "MISSING_SAFETY": return "Safety items not listed";
    case "MISSING_AMENITIES": return "Common amenities not listed";
    case "NO_RULES": return "House rules missing in Knowledge Base";
    case "NO_CHECKIN_INFO": return "Check-in instructions missing in Knowledge Base";
    case "UNREACHABLE": return "Listing page unreachable";
    default: return i.title;
  }
}

export async function getListingDetail(teamId: string, propertyId: string) {
  const property = await prisma.propertyKnowledgeItem.findFirst({
    where: { id: propertyId, client: { teamId } },
    select: {
      id: true,
      internalName: true,
      listingName: true,
      airbnbUrl: true,
      clientId: true,
      client: { select: { name: true } },
      rules: true,
      checkInInfo: true,
      parkingInfo: true,
      checkoutInfo: true,
      wifiName: true,
      wifiPassword: true,
      doorCode: true,
    },
  });
  if (!property) return null;
  const [snapshots, reviews, notes, tasks, people, aiReady] = await Promise.all([
    prisma.listingHealthSnapshot.findMany({ where: { propertyId }, orderBy: { fetchedAt: "desc" }, take: 12 }),
    prisma.listingReview.findMany({ where: { propertyId }, orderBy: [{ reviewDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }] }),
    prisma.listingAiNote.findMany({ where: { propertyId }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.task.findMany({
      where: { teamId, sourceRef: { startsWith: `lh:${propertyId}:` }, deletedAt: null },
      select: { id: true, sourceRef: true, status: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({ where: { teamId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    isAiReady(teamId),
  ]);
  const latestNote = (kind: string) => notes.find((n) => n.kind === kind) ?? null;
  const noteView = (n: (typeof notes)[number] | null) => (n ? { content: n.content as any, model: n.model, createdAt: n.createdAt.toISOString() } : null);
  const replies: Record<string, { text: string; createdAt: string }> = {};
  for (const n of notes) if (n.kind === "REVIEW_REPLY" && n.reviewId && !replies[n.reviewId]) replies[n.reviewId] = { text: (n.content as any)?.text ?? "", createdAt: n.createdAt.toISOString() };
  const linkedTasks: Record<string, { id: string; status: string }> = {};
  for (const t of tasks) {
    const key = t.sourceRef!.slice(`lh:${propertyId}:`.length);
    if (!linkedTasks[key]) linkedTasks[key] = { id: t.id, status: t.status };
  }
  const latest = snapshots[0] ? view(snapshots[0]) : null;
  return {
    property: { id: property.id, internalName: property.internalName, listingName: property.listingName, airbnbUrl: property.airbnbUrl, clientId: property.clientId, clientName: property.client.name },
    // Real values for the {{DOOR_CODE}}/{{WIFI_*}} placeholders — filled in on
    // the page only, never sent to the AI.
    secrets: { doorCode: property.doorCode, wifiName: property.wifiName, wifiPassword: property.wifiPassword },
    templateGuide: templateCheckinGuide(property),
    ai: {
      ready: aiReady,
      insights: noteView(latestNote("INSIGHTS")),
      guide: noteView(latestNote("CHECKIN_GUIDE")),
      copy: noteView(latestNote("COPY")),
      replies,
    },
    linkedTasks,
    people,
    latest,
    missing: latest ? missingAmenities(latest.amenities) : null,
    history: snapshots.filter((s) => s.ok).map((s) => ({ fetchedAt: s.fetchedAt.toISOString(), rating: s.rating, reviewCount: s.reviewCount, healthScore: s.healthScore })),
    reviews: reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      privateNote: r.privateNote,
      guestName: r.guestName,
      reviewDate: r.reviewDate?.toISOString() ?? null,
      source: r.source,
      themes: themesOf(r),
    })),
    themes: analyzeReviews(reviews),
    byStar: starBuckets(reviews),
  };
}

/** Default client: the one with the most knowledge-base listings. */
export async function defaultClientId(teamId: string) {
  const rows = await prisma.propertyKnowledgeItem.groupBy({ by: ["clientId"], where: { client: { teamId } }, _count: { _all: true } });
  return rows.sort((a, b) => b._count._all - a._count._all)[0]?.clientId ?? null;
}

/** All imported reviews at or below a star rating, for the CSV list export. */
export async function lowStarReviews(teamId: string, clientId: string, maxRating: number) {
  return prisma.listingReview.findMany({
    where: { rating: { lte: maxRating }, property: { clientId, client: { teamId } } },
    include: { property: { select: { internalName: true, listingName: true, airbnbUrl: true } } },
    orderBy: [{ rating: "asc" }, { reviewDate: { sort: "desc", nulls: "last" } }],
  });
}
