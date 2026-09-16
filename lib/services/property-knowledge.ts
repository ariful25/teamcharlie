// Shared logic for the Property Knowledge Base module: Airbnb URL identity,
// completion scoring, and the extraction merge/status rules. Kept in one
// place so the API routes (create, update, bulk-import, extract, export)
// never re-implement the same field lists or validation independently.
//
// This module is imported from a client component too (the status dropdown
// options), so it must stay free of server-only APIs (no Prisma, no `fs`).

// ---------- Airbnb URL validation & normalization ----------

// Airbnb serves localized country-code domains, not just subdomains of
// airbnb.com (e.g. airbnb.co.uk, airbnb.de) — an allowlist of exact
// registrable domains is both more permissive (accepts real localized
// links) and safer (rejects lookalikes like "airbnb.com.evil.com" or
// "myairbnb.com" that a suffix/substring check would let through).
const AIRBNB_HOSTS = new Set([
  "airbnb.com",
  "airbnb.co.uk",
  "airbnb.ca",
  "airbnb.ie",
  "airbnb.de",
  "airbnb.fr",
  "airbnb.it",
  "airbnb.es",
  "airbnb.pt",
  "airbnb.nl",
  "airbnb.be",
  "airbnb.ch",
  "airbnb.at",
  "airbnb.se",
  "airbnb.no",
  "airbnb.dk",
  "airbnb.fi",
  "airbnb.pl",
  "airbnb.com.au",
  "airbnb.co.nz",
  "airbnb.co.in",
  "airbnb.co.jp",
  "airbnb.com.br",
  "airbnb.com.mx",
  "airbnb.com.sg",
  "airbnb.co.kr",
  "airbnb.com.hk",
]);

export function isAirbnbUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return AIRBNB_HOSTS.has(host);
  } catch {
    return false;
  }
}

// Only a real /rooms/<id> path counts as the listing id. Tracking params
// like source_impression_id are never a valid stand-in — they identify the
// click, not the listing, and two different guests clicking the same
// listing get two different impression ids.
export function extractAirbnbListingId(value: string): string | null {
  try {
    const url = new URL(value);
    return url.pathname.match(/\/rooms\/(\d+)/i)?.[1] ?? null;
  } catch {
    return null;
  }
}

export type NormalizedAirbnbUrl = { url: string; listingId: string | null };

// Collapses every variant of the same listing (different query strings,
// tracking params, http/https, host casing, trailing slash) to one
// canonical URL so duplicate-prevention and lookups work on listing
// identity rather than raw string equality. Returns null for non-Airbnb
// input; callers should validate with isAirbnbUrl first for a clean error.
export function normalizeAirbnbUrl(value: string): NormalizedAirbnbUrl | null {
  if (!isAirbnbUrl(value)) return null;
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const listingId = extractAirbnbListingId(value);

  if (listingId) {
    return { url: `https://www.${host}/rooms/${listingId}`, listingId };
  }

  const path = url.pathname.replace(/\/+$/, "") || "/";
  return { url: `https://www.${host}${path}`, listingId: null };
}

// ---------- Completion scoring ----------

// Fields that make a listing actually usable operationally. Kept separate
// from OPTIONAL_KNOWLEDGE_FIELDS because things like wifi password or
// internal notes legitimately don't apply to every property and shouldn't
// hold a fully-reviewed listing below 100%.
export const REQUIRED_KNOWLEDGE_FIELDS = [
  "listingName",
  "description",
  "location",
  "guestCapacity",
  "bedrooms",
  "bathrooms",
  "beds",
  "checkInInfo",
  "checkoutInfo",
  "wifiName",
  "doorCode",
  "parkingInfo",
] as const;

export const OPTIONAL_KNOWLEDGE_FIELDS = [
  "amenities",
  "propertyType",
  "rules",
  "wifiPassword",
  "internalNotes",
] as const;

// Exported so anything else merging/comparing knowledge-base field values
// (e.g. scripts/normalize-knowledge-base-urls.ts, which reconciles
// pre-existing duplicate rows) uses the exact same "does this count as
// filled in" rule as completion scoring and extraction merging do.
export function isFieldFilled(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (value === null || value === undefined) return false;
  return String(value).trim() !== "";
}

export function computeCompletionPct(data: Record<string, unknown>): number {
  const filled = REQUIRED_KNOWLEDGE_FIELDS.filter((field) => isFieldFilled(data[field])).length;
  return Math.round((filled / REQUIRED_KNOWLEDGE_FIELDS.length) * 100);
}

// ---------- Extraction merge ----------

// The subset of fields Airbnb extraction is allowed to touch. Operational
// fields (wifi, door code, parking, check-in/out notes, internal notes)
// are never in this list, so extraction can never overwrite them even by
// accident — they simply aren't part of the patch.
const AIRBNB_SOURCED_FIELDS = [
  "listingName",
  "description",
  "amenities",
  "propertyType",
  "location",
  "guestCapacity",
  "bedrooms",
  "bathrooms",
  "beds",
  "rules",
] as const;

export type ExtractedAirbnbFields = Partial<Record<(typeof AIRBNB_SOURCED_FIELDS)[number], unknown>> & {
  airbnbListingId?: string | null;
};

// Builds a Prisma update patch from a fresh extraction without ever
// clobbering a manually-reviewed field with null/undefined/""/[] — only a
// meaningful new value from Airbnb is allowed to replace what's already
// there. Fields Airbnb didn't return anything useful for are simply left
// out of the patch, so re-running extraction can only add information.
export function mergeAirbnbExtraction(extracted: ExtractedAirbnbFields): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const field of AIRBNB_SOURCED_FIELDS) {
    const value = extracted[field];
    if (isFieldFilled(value)) {
      patch[field] = value;
    }
  }
  if (extracted.airbnbListingId) {
    patch.airbnbListingId = extracted.airbnbListingId;
  }
  return patch;
}

// ---------- Status lifecycle ----------

// Statuses a person is allowed to pick from a form/API request directly.
// EXTRACTING and FAILED are process-only states written exclusively by the
// extraction route (app/api/knowledge-properties/[id]/extract) — letting a
// form set them would let someone claim an extraction ran when it didn't.
export const MANUAL_KNOWLEDGE_STATUSES = ["PENDING", "NEEDS_REVIEW", "READY", "EXPORTED"] as const;
