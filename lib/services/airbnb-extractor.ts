import { extractAirbnbListingId } from "@/lib/services/property-knowledge";

type ExtractedAirbnbListing = {
  airbnbListingId: string | null;
  listingName: string | null;
  description: string | null;
  amenities: string[];
  propertyType: string | null;
  location: string | null;
  guestCapacity: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  beds: number | null;
  rules: string | null;
  checkInInfo: string | null;
  checkoutInfo: string | null;
};

// Kept comfortably under Vercel's default Hobby-plan function limit (10s) so
// our own friendly timeout error always fires before the platform kills the
// request and returns a raw, unstyled 504 instead.
const FETCH_TIMEOUT_MS = 8_000;

function cleanText(value: unknown) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned || null;
}

function decodeHtml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function metaContent(html: string, selector: string) {
  const patterns = [
    new RegExp(`<meta[^>]+${selector}[^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${selector}[^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return cleanText(decodeHtml(match[1]));
  }
  return null;
}

function extractJsonLd(html: string): Record<string, any>[] {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  return blocks.flatMap((block) => {
    try {
      const parsed = JSON.parse(decodeHtml(block[1].trim()));
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  });
}

function firstNumberFromText(value: string, label: string) {
  const match = value.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s+${label}`, "i"));
  return match ? Number(match[1]) : null;
}

// Airbnb server-renders the listing's real data into a React-hydration
// payload embedded right in the static HTML — a GraphQL response object,
// not something that needs a browser to produce. It's keyed by an operation
// name that can vary, so this looks for the shape (`data.node.pdpPresentation`)
// rather than a fixed array index, and returns null (never throws) if
// Airbnb's markup has changed and the shape isn't there — callers fall back
// to the regex/JSON-LD heuristics below in that case.
function extractPdpPresentation(html: string): { node: any; pdpPresentation: any } | null {
  const match = html.match(/<script id="data-deferred-state-0"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;

  let parsed: any;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return null;
  }

  const entries = parsed?.niobeClientData;
  if (!Array.isArray(entries)) return null;

  for (const entry of entries) {
    const node = entry?.[1]?.data?.node;
    if (node?.pdpPresentation) {
      return { node, pdpPresentation: node.pdpPresentation };
    }
  }
  return null;
}

function htmlToPlainText(html: string) {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return cleanText(decodeHtml(withBreaks).replace(/\n[ \t]*/g, "\n").replace(/\n{3,}/g, "\n\n"));
}

// Only the preview group (~10 items) is guaranteed; seeAllAmenitiesGroups
// has the full breakdown (60+ items across categories) when present,
// including an explicit "Not included" group for amenities the listing
// doesn't have — those come through with available: false and are dropped.
function extractAmenities(pdpPresentation: any): string[] {
  const groups = pdpPresentation?.amenities?.seeAllAmenitiesGroups ?? pdpPresentation?.amenities?.previewAmenitiesGroups ?? [];
  const names = new Set<string>();
  for (const group of groups) {
    for (const item of group?.amenities ?? []) {
      if (item?.available === false) continue;
      const name = cleanText(item?.title);
      if (name) names.add(name);
    }
  }
  return [...names];
}

// pdpPresentation.rules.groupItems is Airbnb's own "House rules" section,
// grouped under headings like "Checking in and out" / "During your stay" /
// "Before you leave". Rendered as a flat, readable text block — this is a
// declared AIRBNB_SOURCED_FIELDS field (see property-knowledge.ts), so like
// every other field there it only fills `rules` when it's still blank.
function extractRules(pdpPresentation: any): string | null {
  const groups = pdpPresentation?.rules?.groupItems;
  if (!Array.isArray(groups) || groups.length === 0) return null;

  const sections = groups.map((group: any) => {
    const heading = cleanText(group?.title);
    const lines = (group?.items ?? [])
      .map((item: any) => {
        const title = cleanText(item?.title);
        if (!title) return null;
        const detail = cleanText(item?.description?.text);
        return detail ? `- ${title} (${detail})` : `- ${title}`;
      })
      .filter((line: string | null): line is string => Boolean(line));
    if (lines.length === 0) return null;
    return heading ? `${heading}\n${lines.join("\n")}` : lines.join("\n");
  }).filter((section: string | null): section is string => Boolean(section));

  return sections.length > 0 ? sections.join("\n\n") : null;
}

// Airbnb's own published check-in/checkout time window (e.g. "Check-in
// after 4:00 PM"), found by `type` code rather than position inside the
// "Checking in and out" rules group. Distinct from checkInInfo/checkoutInfo
// being manual/operational fields elsewhere — this only ever fills them
// when blank (see mergeAirbnbExtraction), so a team's own more detailed
// instructions are never replaced by Airbnb's one-line official window.
function extractCheckInOutWindow(pdpPresentation: any): { checkInInfo: string | null; checkoutInfo: string | null } {
  const items = (pdpPresentation?.rules?.groupItems ?? []).flatMap((group: any) => group?.items ?? []);
  const findByType = (type: string) => cleanText(items.find((item: any) => item?.type === type)?.title);
  return {
    checkInInfo: findByType("HOUSE_RULES_CHECK_IN_WINDOW"),
    checkoutInfo: findByType("HOUSE_RULES_CHECK_OUT_TIME"),
  };
}

// pdpPresentation.overview.items is a short list of plain strings like
// "8 guests", "3 bedrooms", "4 beds", "2 baths" — each matched whole against
// an anchored pattern so "3 bedrooms" can never be mistaken for beds (a
// naive substring search for "bed" matches inside "bedrooms" too).
function extractOverviewCounts(pdpPresentation: any) {
  const items: string[] = Array.isArray(pdpPresentation?.overview?.items) ? pdpPresentation.overview.items : [];
  const find = (pattern: RegExp) => {
    for (const item of items) {
      const match = String(item).match(pattern);
      if (match) return Number(match[1]);
    }
    return null;
  };
  return {
    guestCapacity: find(/^(\d+(?:\.\d+)?)\s+guests?$/i),
    bedrooms: find(/^(\d+(?:\.\d+)?)\s+bedrooms?$/i),
    beds: find(/^(\d+(?:\.\d+)?)\s+beds?$/i),
    bathrooms: find(/^(\d+(?:\.\d+)?)\s+(?:shared\s+|private\s+)?baths?$/i),
  };
}

// Airbnb can return HTTP 200 for a bot-challenge/interstitial page, or ship
// a markup change that breaks every selector above — in both cases we'd
// otherwise "succeed" with an almost-empty record. Require a real signal
// (a title) plus at least one other independent field before trusting the
// page actually was the listing.
function isMeaningfulExtraction(listing: ExtractedAirbnbListing) {
  if (!listing.listingName) return false;
  const otherSignals = [
    listing.description,
    listing.location,
    listing.guestCapacity,
    listing.bedrooms,
    listing.bathrooms,
    listing.beds,
  ].filter((value) => value !== null && value !== undefined);
  return otherSignals.length > 0;
}

export async function extractAirbnbListing(airbnbUrl: string): Promise<ExtractedAirbnbListing> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let html: string;
  try {
    const res = await fetch(airbnbUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; CharlieHQ/1.0; +https://github.com/ariful25/teamcharlie)",
        Accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Airbnb returned HTTP ${res.status}. The listing may be private, removed, or temporarily blocking automated requests.`);
    }

    html = await res.text();
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error("Airbnb did not respond in time. Try again in a moment, or fill in the listing details manually.");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  const jsonLd = extractJsonLd(html);
  const lodging = jsonLd.find((item) => {
    const type = item?.["@type"];
    return type === "LodgingBusiness" || type === "VacationRental" || type === "Product";
  });
  const pdp = extractPdpPresentation(html);
  const pdpPresentation = pdp?.pdpPresentation;

  const title =
    cleanText(pdpPresentation?.title?.content?.localizedString) ??
    cleanText(pdp?.node?.description?.name?.localizedString) ??
    cleanText(lodging?.name) ??
    metaContent(html, `property=["']og:title["']`) ??
    metaContent(html, `name=["']twitter:title["']`) ??
    cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/ - Airbnb$/, ""));

  const description =
    htmlToPlainText(pdpPresentation?.descriptions?.longDescriptionHtml?.localizedStringWithTranslationPreference ?? "") ??
    cleanText(lodging?.description) ??
    metaContent(html, `name=["']description["']`) ??
    metaContent(html, `property=["']og:description["']`);

  const overviewCounts = extractOverviewCounts(pdpPresentation);
  const flattened = decodeHtml(html).replace(/\s+/g, " ");
  const guestCapacity =
    pdp?.node?.personCapacity ??
    overviewCounts.guestCapacity ??
    (Number(lodging?.occupancy?.value ?? lodging?.occupancy) || firstNumberFromText(flattened, "guest"));
  const bedrooms = overviewCounts.bedrooms ?? firstNumberFromText(flattened, "bedroom");
  const bathrooms = overviewCounts.bathrooms ?? firstNumberFromText(flattened, "bath");
  const beds = overviewCounts.beds ?? firstNumberFromText(flattened, "bed");

  const checkInOut = pdpPresentation ? extractCheckInOutWindow(pdpPresentation) : { checkInInfo: null, checkoutInfo: null };

  const address = lodging?.address;
  const location =
    cleanText(pdpPresentation?.location?.subtitle) ??
    cleanText(typeof address === "string" ? address : [address?.addressLocality, address?.addressRegion, address?.addressCountry].filter(Boolean).join(", ")) ??
    metaContent(html, `property=["']og:locality["']`);

  // Real amenities from Airbnb's own hydration payload when present (see
  // extractPdpPresentation/extractAmenities above); falls back to whatever
  // schema.org amenityFeature entries exist in the JSON-LD block, which is
  // rare but harmless to also check.
  const amenityFeature = Array.isArray(lodging?.amenityFeature) ? lodging.amenityFeature : [];
  const amenities = pdpPresentation
    ? extractAmenities(pdpPresentation)
    : amenityFeature
        .filter((feature: any) => feature?.value !== false)
        .map((feature: any) => cleanText(feature?.name))
        .filter((name: string | null): name is string => Boolean(name));

  const listing: ExtractedAirbnbListing = {
    airbnbListingId: extractAirbnbListingId(airbnbUrl),
    listingName: title,
    description,
    amenities,
    propertyType: cleanText(pdp?.node?.propertyType) ?? cleanText(lodging?.additionalType ?? lodging?.["@type"]),
    location,
    guestCapacity: guestCapacity || null,
    bedrooms,
    bathrooms,
    beds,
    rules: pdpPresentation ? extractRules(pdpPresentation) : null,
    checkInInfo: checkInOut.checkInInfo,
    checkoutInfo: checkInOut.checkoutInfo,
  };

  if (!isMeaningfulExtraction(listing)) {
    throw new Error(
      "Airbnb did not return usable listing information (the page may have been blocked, redirected to a challenge page, or changed format). Fill in the details manually and try extraction again later."
    );
  }

  return listing;
}
