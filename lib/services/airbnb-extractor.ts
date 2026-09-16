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

  const title =
    cleanText(lodging?.name) ??
    metaContent(html, `property=["']og:title["']`) ??
    metaContent(html, `name=["']twitter:title["']`) ??
    cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/ - Airbnb$/, ""));

  const description =
    cleanText(lodging?.description) ??
    metaContent(html, `name=["']description["']`) ??
    metaContent(html, `property=["']og:description["']`);

  const flattened = decodeHtml(html).replace(/\s+/g, " ");
  const guestCapacity = Number(lodging?.occupancy?.value ?? lodging?.occupancy) || firstNumberFromText(flattened, "guest");
  const bedrooms = firstNumberFromText(flattened, "bedroom");
  const bathrooms = firstNumberFromText(flattened, "bath");
  const beds = firstNumberFromText(flattened, "bed");

  const address = lodging?.address;
  const location =
    cleanText(typeof address === "string" ? address : [address?.addressLocality, address?.addressRegion, address?.addressCountry].filter(Boolean).join(", ")) ??
    metaContent(html, `property=["']og:locality["']`);

  const listing: ExtractedAirbnbListing = {
    airbnbListingId: extractAirbnbListingId(airbnbUrl),
    listingName: title,
    description,
    amenities: [],
    propertyType: cleanText(lodging?.additionalType ?? lodging?.["@type"]),
    location,
    guestCapacity: guestCapacity || null,
    bedrooms,
    bathrooms,
    beds,
    rules: null,
  };

  if (!isMeaningfulExtraction(listing)) {
    throw new Error(
      "Airbnb did not return usable listing information (the page may have been blocked, redirected to a challenge page, or changed format). Fill in the details manually and try extraction again later."
    );
  }

  return listing;
}
