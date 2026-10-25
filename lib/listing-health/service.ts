import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fetchListingPage } from "@/lib/services/airbnb-extractor";
import { parsePublicListing, type CategoryKey } from "./parse";
import { detectIssues, healthScore, qualityScore, type Issue } from "./score";
import { parseReviewsCsv, reviewFingerprint } from "./csv";

// Listing Health workflow: public-page snapshots and review imports. Every
// entry point is team-scoped through property → client → teamId.

/** Don't re-fetch a listing more often than this (protects against hammering Airbnb). */
const MIN_REFRESH_MS = 10 * 60 * 1000;

export class ListingHealthError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

async function propertyForTeam(propertyId: string, teamId: string) {
  const property = await prisma.propertyKnowledgeItem.findFirst({ where: { id: propertyId, client: { teamId } } });
  if (!property) throw new ListingHealthError("Listing not found.", 404);
  return property;
}

export async function refreshListingHealth(propertyId: string, teamId: string, opts: { force?: boolean } = {}) {
  const property = await propertyForTeam(propertyId, teamId);
  const last = await prisma.listingHealthSnapshot.findFirst({ where: { propertyId }, orderBy: { fetchedAt: "desc" } });
  if (!opts.force && last && Date.now() - last.fetchedAt.getTime() < MIN_REFRESH_MS) return { snapshot: last, cached: true };

  const previousOk = await prisma.listingHealthSnapshot.findFirst({ where: { propertyId, ok: true }, orderBy: { fetchedAt: "desc" } });
  const context = { previousRating: previousOk?.rating ?? null, hasRules: !!property.rules?.trim(), hasCheckInInfo: !!property.checkInInfo?.trim() };

  let snapshot;
  try {
    const page = await fetchListingPage(property.airbnbUrl);
    const parsed = parsePublicListing(page.html);
    // A title alone proves nothing (a redirect or challenge page has one too):
    // trust the page only if it carries the listing JSON or a real star rating.
    const hasData = page.html.includes("data-deferred-state") && !!parsed.title;
    if (!hasData && parsed.rating === null) {
      // Keep enough detail to tell a bot-challenge page from a removed listing.
      const pageTitle = page.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim().slice(0, 80) || "none";
      throw new Error(
        `Airbnb didn't return listing data (blocked, redirected, or the listing is unavailable). ` +
          `[HTTP ${page.status}, ${Math.round(page.html.length / 1024)} KB, listing JSON ${hasData ? "present" : "missing"}, ` +
          `page title "${pageTitle}", final URL ${page.finalUrl.slice(0, 120)}]`,
      );
    }
    const issues: Issue[] = detectIssues(parsed, context);
    snapshot = await prisma.listingHealthSnapshot.create({
      data: {
        propertyId,
        ok: true,
        title: parsed.title,
        rating: parsed.rating,
        reviewCount: parsed.reviewCount,
        ...parsed.categories,
        starShares: parsed.starShares ?? Prisma.JsonNull,
        reviewTags: parsed.reviewTags as unknown as Prisma.InputJsonValue,
        guestFavorite: parsed.guestFavorite,
        superhost: parsed.superhost,
        photoCount: parsed.photoCount,
        genericCaptions: parsed.genericCaptions,
        descriptionLength: parsed.descriptionLength,
        amenities: parsed.amenities,
        healthScore: healthScore(parsed),
        qualityScore: qualityScore(parsed, context),
        issues: issues as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (err: any) {
    const issue: Issue = {
      code: "UNREACHABLE",
      severity: "high",
      title: "Listing page couldn't be read",
      detail: err?.message ?? "Unknown error",
      action: "Open the listing on Airbnb — it may be snoozed, deactivated or the URL changed. Try the check again later.",
    };
    snapshot = await prisma.listingHealthSnapshot.create({
      data: { propertyId, ok: false, error: issue.detail, issues: [issue] as unknown as Prisma.InputJsonValue },
    });
  }
  return { snapshot, cached: false };
}

/** Matches a CSV "listing" cell to one of the client's listings. */
export function matchListing(ref: string | null, listings: { id: string; airbnbListingId: string | null; airbnbUrl: string; internalName: string; listingName: string | null }[]) {
  if (!ref) return null;
  const r = ref.trim().toLowerCase();
  const idInRef = r.match(/rooms\/(\d+)/)?.[1] ?? (/^\d{5,}$/.test(r) ? r : null);
  return (
    listings.find((l) => idInRef && (l.airbnbListingId === idInRef || l.airbnbUrl.includes(idInRef))) ??
    listings.find((l) => l.internalName.trim().toLowerCase() === r) ??
    listings.find((l) => l.listingName?.trim().toLowerCase() === r) ??
    null
  );
}

export async function importReviews(input: { teamId: string; actorId: string; clientId: string; propertyId?: string | null; csv: string }) {
  const client = await prisma.client.findFirst({ where: { id: input.clientId, teamId: input.teamId } });
  if (!client) throw new ListingHealthError("Client not found.", 404);
  if (input.csv.length > 5_000_000) throw new ListingHealthError("That file is too large (5 MB max).");

  const listings = await prisma.propertyKnowledgeItem.findMany({
    where: { clientId: client.id },
    select: { id: true, airbnbListingId: true, airbnbUrl: true, internalName: true, listingName: true },
  });
  const fixed = input.propertyId ? listings.find((l) => l.id === input.propertyId) : null;
  if (input.propertyId && !fixed) throw new ListingHealthError("Listing not found.", 404);

  const { rows, skipped, columns } = parseReviewsCsv(input.csv);
  if (!columns || (columns.rating < 0 || columns.comment < 0)) {
    throw new ListingHealthError(skipped[0]?.reason ?? "The file needs a header row with a rating column and a review column.");
  }
  if (!fixed && columns.listing < 0) {
    throw new ListingHealthError("Importing for the whole client needs a listing column (Airbnb ID, listing URL or listing name). Or import from a single listing's page.");
  }

  const unmatched: { line: number; ref: string | null }[] = [];
  const data: Prisma.ListingReviewCreateManyInput[] = [];
  for (const row of rows) {
    const listing = fixed ?? matchListing(row.listingRef, listings);
    if (!listing) {
      unmatched.push({ line: row.line, ref: row.listingRef });
      continue;
    }
    data.push({
      propertyId: listing.id,
      source: "IMPORT",
      reviewDate: row.reviewDate,
      rating: row.rating,
      guestName: row.guestName,
      comment: row.comment.slice(0, 5000),
      privateNote: row.privateNote?.slice(0, 5000) ?? null,
      fingerprint: reviewFingerprint(row),
      createdById: input.actorId,
    });
  }
  const created = data.length ? await prisma.listingReview.createMany({ data, skipDuplicates: true }) : { count: 0 };
  return {
    imported: created.count,
    duplicates: data.length - created.count,
    skipped: skipped.slice(0, 20),
    skippedCount: skipped.length,
    unmatched: unmatched.slice(0, 20),
    unmatchedCount: unmatched.length,
  };
}

export async function addReview(input: { teamId: string; actorId: string; propertyId: string; rating: number; comment: string; guestName?: string | null; reviewDate?: string | null; privateNote?: string | null }) {
  await propertyForTeam(input.propertyId, input.teamId);
  const reviewDate = input.reviewDate ? new Date(input.reviewDate) : null;
  const fingerprint = reviewFingerprint({ rating: input.rating, comment: input.comment, reviewDate });
  try {
    return await prisma.listingReview.create({
      data: {
        propertyId: input.propertyId,
        source: "MANUAL",
        rating: input.rating,
        comment: input.comment.trim(),
        guestName: input.guestName?.trim() || null,
        privateNote: input.privateNote?.trim() || null,
        reviewDate,
        fingerprint,
        createdById: input.actorId,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ListingHealthError("That review is already saved for this listing.", 409);
    }
    throw err;
  }
}

export async function deleteReview(teamId: string, reviewId: string) {
  const result = await prisma.listingReview.deleteMany({ where: { id: reviewId, property: { client: { teamId } } } });
  if (result.count === 0) throw new ListingHealthError("Review not found.", 404);
}

export type { CategoryKey };
