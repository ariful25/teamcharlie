import type { CategoryKey, PublicListingSnapshot } from "./parse";

// Pure scoring for Listing Health — no I/O, covered by
// scripts/test-listing-health.ts.
//
// Two separate scores, because they answer different questions:
// - healthScore: how happy guests are (ratings, low-star share, weakest
//   category, review volume, Guest Favorite).
// - qualityScore: how complete and search-ready the listing itself is
//   (title, description, photos, captions, amenities, safety items). This is
//   the part of Airbnb "SEO" we can measure from the public page; price,
//   availability and response rate also matter but aren't visible there.

export type Severity = "high" | "medium" | "low";
export type Issue = { code: string; severity: Severity; title: string; detail: string; action: string };

export const CATEGORY_LABEL: Record<CategoryKey, string> = {
  cleanliness: "Cleanliness",
  accuracy: "Accuracy",
  checkin: "Check-in",
  communication: "Communication",
  location: "Location",
  value: "Value",
};

const CATEGORY_ACTION: Record<CategoryKey, string> = {
  cleanliness: "Tighten the cleaning checklist (bathrooms, floors, linens), require photo proof after each turnover, and spot-inspect.",
  accuracy: "Make the photos, title and description match what guests find. Remove outdated photos, call out any limitations honestly.",
  checkin: "Re-check the arrival guide: door code/lockbox steps, parking, photos of the entrance and send it 24h before arrival.",
  communication: "Reply faster (aim under 1 hour), send check-in/mid-stay/check-out messages, and answer questions fully the first time.",
  location: "Set expectations in the description (noise, distances, neighbourhood) so guests aren't surprised.",
  value: "Review the nightly price and cleaning fee against nearby listings, and make sure the basics (supplies, amenities) feel generous.",
};

/** Must-have amenities guests filter on — missing ones cost search visibility. */
export const KEY_AMENITIES: { label: string; match: RegExp }[] = [
  { label: "Wifi", match: /\bwi-?fi\b/i },
  { label: "Kitchen", match: /^kitchen$/i },
  { label: "Free parking", match: /free (on-premises |street |residential )?parking|free parking/i },
  { label: "Washer", match: /\bwasher\b/i },
  { label: "Dryer", match: /\bdryer\b(?! ?-? ?hair)/i },
  { label: "Air conditioning", match: /air conditioning|central air|\bac\b/i },
  { label: "Heating", match: /heating/i },
  { label: "Dedicated workspace", match: /workspace/i },
  { label: "Self check-in", match: /self check-?in|keypad|smart lock|lockbox/i },
  { label: "TV", match: /\btv\b|hdtv/i },
  { label: "Coffee maker", match: /coffee/i },
  { label: "Hair dryer", match: /hair ?dryer/i },
];

export const SAFETY_AMENITIES: { label: string; match: RegExp }[] = [
  { label: "Smoke alarm", match: /smoke alarm|smoke detector/i },
  { label: "Carbon monoxide alarm", match: /carbon monoxide/i },
  { label: "First aid kit", match: /first aid/i },
  { label: "Fire extinguisher", match: /fire extinguisher/i },
];

function missing(amenities: string[], list: { label: string; match: RegExp }[]) {
  return list.filter((a) => !amenities.some((x) => a.match.test(x))).map((a) => a.label);
}

const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));

/** Estimated number of reviews per star (share × total). */
export function starCounts(s: Pick<PublicListingSnapshot, "starShares" | "reviewCount">) {
  if (!s.starShares || !s.reviewCount) return null;
  const out = { "5": 0, "4": 0, "3": 0, "2": 0, "1": 0 } as Record<"5" | "4" | "3" | "2" | "1", number>;
  for (const k of Object.keys(out) as (keyof typeof out)[]) out[k] = Math.round(s.starShares[k] * s.reviewCount);
  return out;
}

export function lowStarShare(s: Pick<PublicListingSnapshot, "starShares">) {
  if (!s.starShares) return null;
  return s.starShares["3"] + s.starShares["2"] + s.starShares["1"];
}

export function weakestCategory(s: Pick<PublicListingSnapshot, "categories">): { key: CategoryKey; value: number } | null {
  let worst: { key: CategoryKey; value: number } | null = null;
  for (const [key, value] of Object.entries(s.categories) as [CategoryKey, number | null][]) {
    if (value !== null && (!worst || value < worst.value)) worst = { key, value };
  }
  return worst;
}

/** Guest-experience score 0–100, or null when there aren't reviews to judge. */
export function healthScore(s: PublicListingSnapshot): number | null {
  if (s.rating === null || !s.reviewCount) return null;
  const ratingPts = 50 * clamp((s.rating - 4.0) / 1.0); // 4.0 → 0, 5.0 → 50
  const low = lowStarShare(s);
  const lowPts = low === null ? 10 : 20 * clamp(1 - low / 0.15); // 0% → 20, ≥15% → 0
  const worst = weakestCategory(s);
  const catPts = worst ? 15 * clamp((worst.value - 4.5) / 0.5) : 7.5; // 4.5 → 0, 5.0 → 15
  const volumePts = 10 * clamp(Math.log10(1 + s.reviewCount) / Math.log10(51)); // 50+ reviews → full
  const badgePts = s.guestFavorite ? 5 : 0;
  return Math.round(ratingPts + lowPts + catPts + volumePts + badgePts);
}

/** Listing completeness / search-readiness 0–100. */
export function qualityScore(s: PublicListingSnapshot, extras: { hasRules: boolean; hasCheckInInfo: boolean }): number {
  const titleLen = s.title?.length ?? 0;
  const titlePts = titleLen >= 30 && titleLen <= 50 ? 15 : titleLen >= 20 ? 8 : titleLen > 0 ? 3 : 0;
  const desc = s.descriptionLength ?? 0;
  const descPts = desc >= 800 ? 15 : desc >= 400 ? 10 : desc >= 150 ? 5 : 0;
  const photos = s.photoCount ?? 0;
  const photoPts = photos >= 25 ? 20 : photos >= 15 ? 12 : photos >= 8 ? 6 : 0;
  const customShare = s.photoCount ? 1 - (s.genericCaptions ?? s.photoCount) / s.photoCount : 0;
  const captionPts = customShare >= 0.5 ? 10 : customShare >= 0.2 ? 5 : 0;
  const keyCoverage = 1 - missing(s.amenities, KEY_AMENITIES).length / KEY_AMENITIES.length;
  const safetyCoverage = 1 - missing(s.amenities, SAFETY_AMENITIES).length / SAFETY_AMENITIES.length;
  return Math.round(
    titlePts + descPts + photoPts + captionPts + 15 * keyCoverage + 10 * safetyCoverage + (extras.hasRules ? 5 : 0) + (extras.hasCheckInInfo ? 5 : 0)
  );
}

/** Concrete, fixable problems — highest severity first. */
export function detectIssues(
  s: PublicListingSnapshot,
  context: { previousRating?: number | null; hasRules: boolean; hasCheckInInfo: boolean }
): Issue[] {
  const issues: Issue[] = [];

  if (s.rating !== null && s.reviewCount) {
    if (s.rating < 4.8) {
      issues.push({
        code: "RATING_LOW",
        severity: s.rating < 4.7 ? "high" : "medium",
        title: `Rating ${s.rating.toFixed(2)} is below 4.8`,
        detail: "Listings under ~4.8 lose Guest Favorite eligibility and rank lower in search.",
        action: "Fix the lowest category below first. It moves the overall rating fastest.",
      });
    }
    if (context.previousRating && s.rating < context.previousRating - 0.02) {
      issues.push({
        code: "RATING_DROP",
        severity: "high",
        title: `Rating dropped ${(context.previousRating - s.rating).toFixed(2)} since the last check`,
        detail: `Was ${context.previousRating.toFixed(2)}, now ${s.rating.toFixed(2)}. A recent stay went badly.`,
        action: "Read the newest reviews (import them below) and contact the guest/cleaner while it's fresh.",
      });
    }
  }

  for (const [key, value] of Object.entries(s.categories) as [CategoryKey, number | null][]) {
    if (value !== null && value < 4.8) {
      issues.push({
        code: `CATEGORY_${key.toUpperCase()}`,
        severity: value < 4.6 ? "high" : value < 4.7 ? "medium" : "low",
        title: `${CATEGORY_LABEL[key]} ${value.toFixed(2)}`,
        detail: `Guests rate ${CATEGORY_LABEL[key].toLowerCase()} below the 4.8 that top listings hold.`,
        action: CATEGORY_ACTION[key],
      });
    }
  }

  const low = lowStarShare(s);
  const counts = starCounts(s);
  if (low !== null && low >= 0.05) {
    const n = counts ? counts["3"] + counts["2"] + counts["1"] : null;
    issues.push({
      code: "LOW_STAR_SHARE",
      severity: low >= 0.1 ? "high" : "medium",
      title: `${Math.round(low * 100)}% of reviews are 3★ or lower${n ? ` (~${n})` : ""}`,
      detail: "Each low review pulls the average down for a long time.",
      action: "Import the reviews and use “What's wrong” to find the repeated complaint.",
    });
  }

  if (s.reviewCount !== null && s.reviewCount < 10) {
    issues.push({
      code: "FEW_REVIEWS",
      severity: "medium",
      title: `Only ${s.reviewCount} reviews`,
      detail: "New listings rank lower until they have social proof.",
      action: "Ask happy guests for a review in the check-out message; consider a short intro discount.",
    });
  }

  if (s.photoCount !== null && s.photoCount < 20) {
    issues.push({
      code: "FEW_PHOTOS",
      severity: s.photoCount < 12 ? "high" : "medium",
      title: `${s.photoCount} photos`,
      detail: "Top listings show 25+ photos covering every room, bed and amenity.",
      action: "Add photos of each bedroom/bed, bathrooms, kitchen, outdoor space and the entrance.",
    });
  }
  if (s.photoCount && s.genericCaptions !== null && s.genericCaptions / s.photoCount > 0.5) {
    issues.push({
      code: "GENERIC_CAPTIONS",
      severity: "low",
      title: `${s.genericCaptions} of ${s.photoCount} photos have no real caption`,
      detail: "Captions like “Bedroom image 3” tell guests (and search) nothing.",
      action: "Write short captions: bed size, view, what's included (e.g. “Queen bed · blackout curtains”).",
    });
  }

  const titleLen = s.title?.length ?? 0;
  if (titleLen > 0 && titleLen < 30) {
    issues.push({
      code: "SHORT_TITLE",
      severity: "medium",
      title: `Title is only ${titleLen} characters`,
      detail: "Airbnb allows 50. Unused characters are lost selling points.",
      action: "Lead with the strongest hook (view, hot tub, walk to X, sleeps N) and use most of the 50 characters.",
    });
  }
  if (s.descriptionLength !== null && s.descriptionLength < 400) {
    issues.push({
      code: "SHORT_DESCRIPTION",
      severity: "medium",
      title: `Description is short (${s.descriptionLength} characters)`,
      detail: "Short descriptions convert worse and cause accuracy complaints.",
      action: "Describe the space room by room, the neighbourhood, parking and any quirks.",
    });
  }

  const missingSafety = missing(s.amenities, SAFETY_AMENITIES);
  if (s.amenities.length > 0 && missingSafety.length > 0) {
    issues.push({
      code: "MISSING_SAFETY",
      severity: missingSafety.some((m) => m === "Smoke alarm" || m === "Carbon monoxide alarm") ? "high" : "medium",
      title: `Safety items not listed: ${missingSafety.join(", ")}`,
      detail: "Guests and Airbnb look for these; missing alarms can also be a compliance problem.",
      action: "Confirm they're installed at the property and tick them in the listing's amenities.",
    });
  }
  const missingKey = missing(s.amenities, KEY_AMENITIES);
  if (s.amenities.length > 0 && missingKey.length >= 3) {
    issues.push({
      code: "MISSING_AMENITIES",
      severity: "low",
      title: `${missingKey.length} common amenities not listed`,
      detail: `Missing: ${missingKey.join(", ")}.`,
      action: "Add any the property actually has. Guests filter search by these.",
    });
  }

  if (!context.hasRules) {
    issues.push({ code: "NO_RULES", severity: "low", title: "House rules not captured", detail: "The knowledge base has no house rules for this listing.", action: "Add the rules in the Knowledge Base so the team answers guests consistently." });
  }
  if (!context.hasCheckInInfo) {
    issues.push({ code: "NO_CHECKIN_INFO", severity: "low", title: "Check-in instructions missing", detail: "The knowledge base has no check-in details.", action: "Add door/lockbox, parking and arrival steps in the Knowledge Base." });
  }

  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity]);
}

export function missingAmenities(amenities: string[]) {
  return { key: missing(amenities, KEY_AMENITIES), safety: missing(amenities, SAFETY_AMENITIES) };
}
