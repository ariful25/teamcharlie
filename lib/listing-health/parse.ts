import { cleanText, extractAmenities, extractPdpPresentation, htmlToPlainText, parseDeferredState } from "@/lib/services/airbnb-extractor";

// Reads the public review/quality signals out of an Airbnb listing page's
// hydration payload. Field locations were confirmed against live listings;
// every lookup has a fallback (or a deep search by key) and missing data
// comes back as null — never a thrown error — so a markup change degrades to
// "unknown" instead of breaking the health check.

export type CategoryKey = "cleanliness" | "accuracy" | "checkin" | "communication" | "location" | "value";

export type PublicListingSnapshot = {
  title: string | null;
  rating: number | null;
  reviewCount: number | null;
  categories: Record<CategoryKey, number | null>;
  /** Share of reviews per star, e.g. { 5: 0.74, 4: 0.18, ... }. */
  starShares: Record<"5" | "4" | "3" | "2" | "1", number> | null;
  reviewTags: { name: string; count: number }[];
  guestFavorite: boolean;
  superhost: boolean;
  photoCount: number | null;
  /** Photos whose caption is Airbnb's default ("Bedroom image 3") rather than written by the host. */
  genericCaptions: number | null;
  descriptionLength: number | null;
  amenities: string[];
};

const CATEGORY_MAP: Record<string, CategoryKey> = {
  CLEANLINESS: "cleanliness",
  ACCURACY: "accuracy",
  CHECKIN: "checkin",
  COMMUNICATION: "communication",
  LOCATION: "location",
  VALUE: "value",
};

/** First value found for `key` anywhere in the tree (depth-limited). */
export function findKey(node: unknown, key: string, depth = 0): unknown {
  if (!node || typeof node !== "object" || depth > 40) return undefined;
  if (!Array.isArray(node) && Object.prototype.hasOwnProperty.call(node, key)) return (node as Record<string, unknown>)[key];
  for (const value of Object.values(node as Record<string, unknown>)) {
    const found = findKey(value, key, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value.replace(/[^\d.]/g, "")) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function truthy(value: unknown) {
  return value === true || value === "true";
}

export const GENERIC_CAPTION = /^[\w\s'&/-]{1,40}\bimage\s+\d+$/i;

export function parsePublicListing(html: string): PublicListingSnapshot {
  const root = parseDeferredState(html);
  const pdp = extractPdpPresentation(html);
  const presentation = pdp?.pdpPresentation;
  const quality = presentation?.quality;

  // Ratings: the per-listing stats object is the most precise (4.87, not "4.9").
  const overall = quality?.listingRatingStats?.overallRatingStats;
  const rating = num(overall?.ratingAverage) ?? num(findKey(root, "starRating"));
  const reviewCount = num(overall?.ratingCount) ?? num(findKey(root, "reviewCount")) ?? num(findKey(root, "visibleReviewCount"));

  const categories: Record<CategoryKey, number | null> = {
    cleanliness: null,
    accuracy: null,
    checkin: null,
    communication: null,
    location: null,
    value: null,
  };
  const precise = pdp?.node?.listingRatingStats?.categoryRatingStats;
  if (Array.isArray(precise)) {
    for (const c of precise) {
      const k = CATEGORY_MAP[String(c?.categoryTypeA ?? c?.categoryType ?? "")];
      if (k) categories[k] = num(c?.value?.ratingAverage);
    }
  }
  if (Array.isArray(quality?.categoryRatings)) {
    for (const c of quality.categoryRatings) {
      const k = CATEGORY_MAP[String(c?.categoryType ?? "")];
      if (k && categories[k] === null) categories[k] = num(c?.localizedRating);
    }
  }

  let starShares: PublicListingSnapshot["starShares"] = null;
  if (Array.isArray(quality?.ratingDistribution) && quality.ratingDistribution.length > 0) {
    const shares = { "5": 0, "4": 0, "3": 0, "2": 0, "1": 0 };
    for (const d of quality.ratingDistribution) {
      const label = String(d?.label ?? "") as keyof typeof shares;
      if (label in shares && typeof d?.percentage === "number") shares[label] = d.percentage;
    }
    starShares = shares;
  }

  const reviewTags = Array.isArray(quality?.reviewTags)
    ? quality.reviewTags
        .map((t: any) => ({ name: cleanText(t?.localizedName) ?? cleanText(t?.name) ?? "", count: Number(t?.count) || 0 }))
        .filter((t: { name: string }) => t.name)
    : [];

  // Photos: the first section carrying mediaItems is the gallery.
  const findMedia = (node: unknown, depth = 0): any[] | null => {
    if (!node || typeof node !== "object" || depth > 12) return null;
    if (!Array.isArray(node) && Array.isArray((node as any).mediaItems)) return (node as any).mediaItems;
    for (const v of Object.values(node as Record<string, unknown>)) {
      const found = findMedia(v, depth + 1);
      if (found) return found;
    }
    return null;
  };
  const mediaItems = findMedia(findKey(root, "sections") ?? root);
  const photoCount = mediaItems ? mediaItems.length : null;
  const genericCaptions = mediaItems
    ? mediaItems.filter((m) => {
        const caption = cleanText(m?.accessibilityLabel) ?? "";
        return !caption || GENERIC_CAPTION.test(caption);
      }).length
    : null;

  const description = htmlToPlainText(presentation?.descriptions?.longDescriptionHtml?.localizedStringWithTranslationPreference ?? "");

  return {
    title: cleanText(presentation?.title?.content?.localizedString) ?? cleanText(pdp?.node?.description?.name?.localizedString),
    rating,
    reviewCount: reviewCount !== null ? Math.round(reviewCount) : null,
    categories,
    starShares,
    reviewTags,
    guestFavorite: truthy(findKey(root, "isGuestFavorite")) || truthy(findKey(root, "isGuestFav")),
    superhost: truthy(findKey(root, "isSuperhost")) || truthy(findKey(root, "isSuperHost")),
    photoCount,
    genericCaptions,
    descriptionLength: description ? description.length : null,
    amenities: presentation ? extractAmenities(presentation) : [],
  };
}
