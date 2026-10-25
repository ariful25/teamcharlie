// Tests for lib/listing-health — run with `npm run test:listing-health`.

import assert from "node:assert/strict";
import type { PublicListingSnapshot } from "../lib/listing-health/parse";
import { GENERIC_CAPTION, parsePublicListing, ratingFromOgTitle, titleFromDocument } from "../lib/listing-health/parse";
import { detectIssues, healthScore, qualityScore, starCounts } from "../lib/listing-health/score";
import { analyzeReviews, complaintsIn, starBuckets } from "../lib/listing-health/reviews";
import { mapColumns, parseCsv, parseRating, parseReviewsCsv, reviewFingerprint } from "../lib/listing-health/csv";
import { redactCodes, templateCheckinGuide, undash } from "../lib/listing-health/ai";
import { extractJson } from "../lib/ai/providers";
import { softRedirectTarget } from "../lib/services/airbnb-extractor";
import { looksLikeReviewEmail, parseLooseDate, parsePastedReviews, parseReviewEmail, ratingInText } from "../lib/listing-health/review-text";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

// Modelled on the real Mid West listing probed during development.
const sample: PublicListingSnapshot = {
  title: "Modern 3BR near Downtown · Parking · Fast Wi-Fi",
  rating: 4.62,
  reviewCount: 61,
  categories: { cleanliness: 4.64, accuracy: 4.69, checkin: 4.87, communication: 4.84, location: 4.82, value: 4.59 },
  starShares: { "5": 0.74, "4": 0.18, "3": 0.05, "2": 0.03, "1": 0 },
  reviewTags: [{ name: "Location", count: 32 }],
  guestFavorite: false,
  superhost: false,
  photoCount: 48,
  genericCaptions: 30,
  descriptionLength: 900,
  amenities: ["Wifi", "Kitchen", "Free parking on premises", "Washer", "Dryer", "Air conditioning", "Heating", "TV", "Smoke alarm"],
};
const ctx = { hasRules: true, hasCheckInInfo: true };

console.log("Listing health — scoring");

test("star counts estimate from shares × total", () => {
  assert.deepEqual(starCounts(sample), { "5": 45, "4": 11, "3": 3, "2": 2, "1": 0 });
});

test("health score reflects a 4.62 listing with 8% low stars (mid-range)", () => {
  const score = healthScore(sample)!;
  assert.ok(score > 35 && score < 70, `got ${score}`);
});

test("a 4.95 guest favourite scores higher than a 4.62 listing", () => {
  const great = { ...sample, rating: 4.95, guestFavorite: true, starShares: { "5": 0.96, "4": 0.04, "3": 0, "2": 0, "1": 0 }, categories: { ...sample.categories, value: 4.9, cleanliness: 4.95, accuracy: 4.9 } };
  assert.ok(healthScore(great)! > healthScore(sample)! + 20);
});

test("no reviews → no health score (not a fake zero)", () => {
  assert.equal(healthScore({ ...sample, rating: null, reviewCount: 0 }), null);
});

test("issues flag rating, weak categories, low-star share and missing safety items", () => {
  const codes = detectIssues(sample, ctx).map((i) => i.code);
  for (const c of ["RATING_LOW", "CATEGORY_VALUE", "CATEGORY_CLEANLINESS", "LOW_STAR_SHARE", "MISSING_SAFETY", "GENERIC_CAPTIONS"]) assert.ok(codes.includes(c), `missing ${c}`);
  assert.ok(!codes.includes("FEW_PHOTOS"));
});

test("issues are ordered high → low severity", () => {
  const sev = detectIssues(sample, ctx).map((i) => i.severity);
  const rank = { high: 0, medium: 1, low: 2 } as const;
  for (let i = 1; i < sev.length; i++) assert.ok(rank[sev[i - 1]] <= rank[sev[i]]);
});

test("rating drop since the last check is flagged", () => {
  assert.ok(detectIssues(sample, { ...ctx, previousRating: 4.7 }).some((i) => i.code === "RATING_DROP"));
  assert.ok(!detectIssues(sample, { ...ctx, previousRating: 4.62 }).some((i) => i.code === "RATING_DROP"));
});

test("quality score rewards photos/description and penalises missing safety items", () => {
  const q = qualityScore(sample, ctx);
  const sparse = qualityScore({ ...sample, photoCount: 6, genericCaptions: 6, descriptionLength: 100, title: "Cozy home", amenities: [] }, { hasRules: false, hasCheckInInfo: false });
  assert.ok(q > 60 && q <= 100, `got ${q}`);
  assert.ok(sparse < 25, `got ${sparse}`);
});

test("generic photo captions are detected", () => {
  assert.ok(GENERIC_CAPTION.test("Living room image 4"));
  assert.ok(GENERIC_CAPTION.test("Bedroom 2 image 1"));
  assert.ok(!GENERIC_CAPTION.test("Queen bed with blackout curtains"));
});

console.log("Listing health — reviews");

test("complaints in a 5★ review need a complaint cue", () => {
  assert.equal(complaintsIn({ rating: 5, comment: "Great stay, the kitchen was well stocked and the beds were comfy." }).size, 0);
  assert.ok(complaintsIn({ rating: 5, comment: "Lovely home but the wifi kept dropping." }).has("wifi"));
});

test("only the part after 'but' is a complaint", () => {
  const c = complaintsIn({ rating: 4, comment: "Great location and comfy beds, but the wifi kept dropping during our calls." });
  assert.ok(c.has("wifi"));
  assert.ok(!c.has("beds"));
});

test("praise with a negative isn't a complaint", () => {
  assert.equal(complaintsIn({ rating: 5, comment: "No complaints at all, very clean." }).size, 0);
  assert.equal(complaintsIn({ rating: 4, comment: "Never had any issues with check-in." }).size, 0);
});

test("in a 2★ review, themed sentences count unless plainly positive", () => {
  const c = complaintsIn({ rating: 2, comment: "The bathroom had hair everywhere. Location was great. Beds were comfy." });
  assert.ok(c.has("cleanliness"));
  assert.ok(!c.has("beds"));
});

test("private feedback is analysed too", () => {
  assert.ok(complaintsIn({ rating: 4, comment: "Nice place.", privateNote: "The smoke smell in the bedroom was strong." }).has("smell"));
});

test("themes rank by rating-weighted mentions with worst-first quotes", () => {
  const themes = analyzeReviews([
    { rating: 5, comment: "Great place but the parking was confusing." },
    { rating: 1, comment: "Dirty sheets and hair in the shower. Not clean at all." },
    { rating: 3, comment: "Bathroom was dirty and the towels were stained." },
    { rating: 4, comment: "Nice stay, but the wifi didn't work." },
  ]);
  assert.equal(themes[0].key, "cleanliness");
  assert.equal(themes[0].reviews, 2);
  assert.equal(themes[0].quotes[0].rating, 1);
});

test("star buckets count each rating", () => {
  assert.deepEqual(starBuckets([{ rating: 5 }, { rating: 4 }, { rating: 4 }, { rating: 1 }]), { 5: 1, 4: 2, 3: 0, 2: 0, 1: 1 });
});

console.log("Listing health — CSV import");

test("CSV parser handles quotes, commas and newlines inside fields", () => {
  const rows = parseCsv('a,b\n"hello, world","line1\nline2"\n"say ""hi""",x\n');
  assert.deepEqual(rows, [["a", "b"], ["hello, world", "line1\nline2"], ['say "hi"', "x"]]);
});

test("columns are matched by header name; private feedback isn't taken as the review", () => {
  const m = mapColumns(["Reservation", "Guest Name", "Submitted Date", "Overall Rating", "Private Feedback", "Public Review", "Listing ID"]);
  assert.equal(m.guest, 1);
  assert.equal(m.date, 2);
  assert.equal(m.rating, 3);
  assert.equal(m.privateNote, 4);
  assert.equal(m.comment, 5);
  assert.equal(m.listing, 6);
});

test("ratings in many formats", () => {
  assert.equal(parseRating("4"), 4);
  assert.equal(parseRating("4.0"), 4);
  assert.equal(parseRating("3/5"), 3);
  assert.equal(parseRating("★★"), 2);
  assert.equal(parseRating("8"), 4); // 10-point scale
  assert.equal(parseRating("100%"), 5);
  assert.equal(parseRating(""), null);
  assert.equal(parseRating("great"), null);
});

test("rows without a rating or text are reported, not imported", () => {
  const { rows, skipped } = parseReviewsCsv("Rating,Review,Date\n5,Lovely,2026-09-01\n,No rating,2026-09-02\n3,,2026-09-03\n");
  assert.equal(rows.length, 1);
  assert.equal(skipped.length, 2);
});

test("fingerprint ignores whitespace/case so re-imports don't duplicate", () => {
  const d = new Date("2026-09-01");
  assert.equal(reviewFingerprint({ rating: 4, comment: "Nice  place", reviewDate: d }), reviewFingerprint({ rating: 4, comment: "nice place ", reviewDate: d }));
});

console.log("Listing health — AI helpers");

test("codes in free text are masked before anything goes to an AI provider", () => {
  assert.equal(redactCodes("Lockbox 4821 on the left, gate code #73915."), "Lockbox [code] on the left, gate code #[code].");
  assert.equal(redactCodes("Check-in after 4 PM, unit 12"), "Check-in after 4 PM, unit 12");
  assert.equal(redactCodes(null), "");
});

test("JSON is extracted from fenced or chatty model replies", () => {
  assert.deepEqual(extractJson<{ a: number }>('Sure!\n```json\n{"a": 1}\n```'), { a: 1 });
  assert.deepEqual(extractJson<{ a: number }>('Here you go: {"a": 2} hope it helps'), { a: 2 });
  assert.equal(extractJson("no json here"), null);
});

test("template guide uses placeholders, never the real code, and flags gaps", () => {
  const guide = templateCheckinGuide({ listingName: "Jaeger Haus", internalName: "JH", checkInInfo: null, parkingInfo: "Street parking", checkoutInfo: null, wifiName: null, rules: null });
  assert.ok(guide.includes("{{DOOR_CODE}}"));
  assert.ok(guide.includes("Street parking"));
  assert.ok(guide.includes("[team: add check-in steps]"));
});

test("meta-tag fallbacks read a page without the listing JSON", () => {
  assert.equal(ratingFromOgTitle("Home in Columbus · ★4.62 · 3 bedrooms · 4 beds"), 4.62);
  assert.equal(ratingFromOgTitle("Home in Columbus · ★New · 3 bedrooms"), null);
  assert.equal(titleFromDocument("<title>Cozy Loft &amp; Patio - Houses for Rent in Columbus, Ohio, United States - Airbnb</title>"), "Cozy Loft & Patio");
  assert.equal(titleFromDocument("<title>Airbnb | Vacation rentals</title>"), null);
  const page = parsePublicListing('<html><head><title>Cozy Loft - Airbnb</title><meta property="og:title" content="Home in Columbus · ★4.9 · 2 beds"></head></html>');
  assert.equal(page.title, "Cozy Loft");
  assert.equal(page.rating, 4.9);
  assert.equal(titleFromDocument("<title>Redirecting to www.airbnb.co.in</title>"), null);
});

test("AI output never keeps long dashes", () => {
  assert.equal(undash("Thanks so much — we loved hosting you!"), "Thanks so much, we loved hosting you!");
  assert.equal(undash("Check-in is 4–6 PM."), "Check-in is 4 to 6 PM.");
  assert.equal(undash("We fixed it —."), "We fixed it.");
  assert.equal(undash("No dashes here, all good."), "No dashes here, all good.");
});

test("Airbnb's geo-redirect page is followed to the same listing", () => {
  const from = "https://www.airbnb.com/rooms/123?adults=2";
  assert.equal(softRedirectTarget("<html><head><title>Redirecting to www.airbnb.co.in</title></head></html>", from), "https://www.airbnb.co.in/rooms/123?adults=2");
  assert.equal(
    softRedirectTarget('<title>Redirecting to www.airbnb.co.in</title><meta http-equiv="refresh" content="0; url=https://www.airbnb.co.in/rooms/123">', from),
    "https://www.airbnb.co.in/rooms/123",
  );
  assert.equal(softRedirectTarget('<title>Redirecting</title><script>location.href="https://evil.example/x"</script>', from), null);
  assert.equal(softRedirectTarget("<title>Jaeger Haus</title><script data-deferred-state-0>{}</script>", from), null);
});

test("pasted Airbnb reviews split into guest, date, rating and comment", () => {
  const text = `Reviews
Sarah
October 2026
Rating, 5 stars
Lovely home, spotless and the hot tub was perfect.
Show more
Mike
September 2026
The wifi kept dropping and the beds were hard.
Private feedback: please replace the mattress in bedroom 2
Response from Ayesha
Thanks Mike, we've called the ISP.`;
  const out = parsePastedReviews(text);
  assert.equal(out.length, 2);
  assert.deepEqual(
    { ...out[0] },
    { guestName: "Sarah", reviewDate: "2026-10-01", rating: 5, comment: "Lovely home, spotless and the hot tub was perfect.", privateNote: null, listingRef: null }
  );
  assert.equal(out[1].rating, null, "no rating in the text → left for a person");
  assert.equal(out[1].comment, "The wifi kept dropping and the beds were hard.");
  assert.equal(out[1].privateNote, "please replace the mattress in bedroom 2");
});

test("loose dates and ratings", () => {
  assert.equal(parseLooseDate("Oct 12, 2026"), "2026-10-12");
  assert.equal(parseLooseDate("12 October 2026"), "2026-10-12");
  assert.equal(parseLooseDate("2 weeks ago"), null);
  assert.equal(ratingInText("Sam left a 4-star review!"), 4);
  assert.equal(ratingInText("4.0 out of 5"), 4);
  assert.equal(ratingInText("★★★"), 3);
  assert.equal(ratingInText("Stayed 3 nights"), null);
});

test("Airbnb review emails: guest, rating, quote and listing", () => {
  const r = parseReviewEmail({
    subject: "Sam left a 4-star review!",
    body: `Here's what Sam said about their stay:\n\n“Great location but the kitchen needed a deep clean.”\n\nhttps://www.airbnb.com/rooms/1000645092029118307?review=1`,
  });
  assert.equal(r.guestName, "Sam");
  assert.equal(r.rating, 4);
  assert.equal(r.comment, "Great location but the kitchen needed a deep clean.");
  assert.equal(r.listingRef, "1000645092029118307");
  assert.equal(looksLikeReviewEmail("Sam left a 4-star review!", "Airbnb <automated@airbnb.com>"), true);
  assert.equal(looksLikeReviewEmail("Write a review for Sam", "Airbnb <automated@airbnb.com>"), false);
  assert.equal(looksLikeReviewEmail("Your payout was sent", "Airbnb <automated@airbnb.com>"), false);
});

console.log(`\n${passed} passed`);
