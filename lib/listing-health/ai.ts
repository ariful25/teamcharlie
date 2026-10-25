import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runAi, AiError } from "@/lib/ai/client";
import { extractJson } from "@/lib/ai/providers";
import { analyzeReviews } from "./reviews";
import type { Issue } from "./score";

// AI features for Listing Health. Privacy rule: door codes, Wi-Fi details and
// internal notes are NEVER sent to the provider — the guide uses
// {{DOOR_CODE}} / {{WIFI_NAME}} / {{WIFI_PASSWORD}} placeholders that the
// page fills in locally, and stray 4–8 digit numbers in free text are masked.

export type AiKind = "INSIGHTS" | "CHECKIN_GUIDE" | "COPY" | "REVIEW_REPLY";

export type InsightsContent = {
  summary: string;
  priorities: { title: string; why: string; steps: string[]; owner: string }[];
  quickWins: string[];
};
export type CopyContent = { titles: string[]; opening: string; highlights: string[]; captionIdeas: string[] };
export type TextContent = { text: string };

const FEATURE: Record<AiKind, string> = {
  INSIGHTS: "listing-insights",
  CHECKIN_GUIDE: "checkin-guide",
  COPY: "listing-copy",
  REVIEW_REPLY: "review-reply",
};

/** Masks things that look like codes (4–8 digits) in free text. */
export function redactCodes(text: string | null | undefined) {
  return (text ?? "").replace(/\b\d{4,8}\b/g, "[code]").trim();
}

const clip = (s: string | null | undefined, n: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

async function loadContext(propertyId: string, teamId: string) {
  const property = await prisma.propertyKnowledgeItem.findFirst({ where: { id: propertyId, client: { teamId } } });
  if (!property) throw new AiError("Listing not found.", 404);
  const [snapshot, reviews] = await Promise.all([
    prisma.listingHealthSnapshot.findFirst({ where: { propertyId, ok: true }, orderBy: { fetchedAt: "desc" } }),
    prisma.listingReview.findMany({ where: { propertyId }, orderBy: [{ rating: "asc" }, { reviewDate: { sort: "desc", nulls: "last" } }], take: 60 }),
  ]);
  return { property, snapshot, reviews };
}

function listingFacts(ctx: Awaited<ReturnType<typeof loadContext>>) {
  const s = ctx.snapshot;
  const issues = ((s?.issues as Issue[] | null) ?? []).map((i) => `- [${i.severity}] ${i.title}: ${i.detail}`).join("\n");
  const cats = s
    ? `Cleanliness ${s.cleanliness ?? "?"}, Accuracy ${s.accuracy ?? "?"}, Check-in ${s.checkin ?? "?"}, Communication ${s.communication ?? "?"}, Location ${s.location ?? "?"}, Value ${s.value ?? "?"}`
    : "unknown";
  const tags = ((s?.reviewTags as { name: string; count: number }[] | null) ?? []).map((t) => `${t.name} (${t.count})`).join(", ");
  return [
    `Listing: ${ctx.property.listingName ?? ctx.property.internalName}`,
    `Location: ${clip(ctx.property.location, 120) || "unknown"}`,
    `Overall rating: ${s?.rating ?? "unknown"} from ${s?.reviewCount ?? 0} reviews`,
    `Category ratings: ${cats}`,
    `What reviews mention most (Airbnb): ${tags || "n/a"}`,
    `Detected issues:\n${issues || "- none"}`,
  ].join("\n");
}

function reviewDigest(ctx: Awaited<ReturnType<typeof loadContext>>, limit = 40) {
  return ctx.reviews
    .slice(0, limit)
    .map((r) => `- ${r.rating}★: ${clip(r.comment, 400)}${r.privateNote ? ` | private: ${clip(redactCodes(r.privateNote), 200)}` : ""}`)
    .join("\n");
}

/**
 * Models use long dashes however they're asked not to; TeamHQ's copy never
 * does. Ranges become "to" ("60–120" → "60 to 120"), other dashes a comma.
 */
export function undash(text: string) {
  return text
    .replace(/(\d)\s*[–—]\s*(\d)/g, "$1 to $2")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/,\s*([.!?])/g, "$1")
    .replace(/^,\s*/gm, "");
}

function undashDeep<T>(value: T): T {
  if (typeof value === "string") return undash(value) as T;
  if (Array.isArray(value)) return value.map(undashDeep) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, undashDeep(v)])) as T;
  return value;
}

async function save(propertyId: string, kind: AiKind, content: unknown, meta: { provider: string; model: string; userId: string; reviewId?: string | null }) {
  return prisma.listingAiNote.create({
    data: {
      propertyId,
      kind,
      reviewId: meta.reviewId ?? null,
      content: undashDeep(content) as Prisma.InputJsonValue,
      provider: meta.provider,
      model: meta.model,
      createdById: meta.userId,
    },
  });
}

const BASE_SYSTEM =
  "You are an expert short-term rental operations manager helping a property-management team improve Airbnb listings. Be specific, practical and concise. Only use the facts given; never invent amenities, fixes that were made or numbers. Write in plain sentences and never use em dashes or en dashes (— or –); use full stops, commas or colons instead.";

export async function generateInsights(teamId: string, userId: string, propertyId: string) {
  const ctx = await loadContext(propertyId, teamId);
  if (!ctx.snapshot && ctx.reviews.length === 0) throw new AiError("Run a health check or import reviews first. There's nothing to analyse yet.");
  const themes = analyzeReviews(ctx.reviews)
    .slice(0, 8)
    .map((t) => `- ${t.label}: ${t.reviews} reviews`)
    .join("\n");
  const result = await runAi({
    teamId,
    userId,
    feature: FEATURE.INSIGHTS,
    maxTokens: 1800,
    system: `${BASE_SYSTEM} Reply with JSON only.`,
    prompt: `${listingFacts(ctx)}

Complaint themes found in imported reviews:
${themes || "- no reviews imported"}

Guest reviews (lowest rated first):
${reviewDigest(ctx) || "- none imported"}

Write an action plan to raise this listing's rating. Reply with JSON exactly in this shape:
{"summary": "2-3 sentences: what's going wrong and what matters most",
 "priorities": [{"title": "short", "why": "evidence from the data", "steps": ["concrete step", "..."], "owner": "Cleaning | Maintenance | Guest communication | Listing | Pricing"}],
 "quickWins": ["small change that can be done today"]}
Give 3-5 priorities ordered by impact and 3-5 quick wins.`,
  });
  const json = extractJson<InsightsContent>(result.text);
  if (!json?.summary || !Array.isArray(json.priorities)) throw new AiError("The AI reply wasn't in the expected format. Try again.", 502);
  const content: InsightsContent = {
    summary: clip(json.summary, 800),
    priorities: json.priorities.slice(0, 6).map((p) => ({ title: clip(p.title, 120), why: clip(p.why, 400), steps: (p.steps ?? []).slice(0, 6).map((x) => clip(x, 300)), owner: clip(p.owner, 40) })),
    quickWins: (json.quickWins ?? []).slice(0, 6).map((x) => clip(x, 200)),
  };
  return save(propertyId, "INSIGHTS", content, { ...result, userId });
}

export async function generateCheckinGuide(teamId: string, userId: string, propertyId: string) {
  const ctx = await loadContext(propertyId, teamId);
  const p = ctx.property;
  const complaints = analyzeReviews(ctx.reviews).find((t) => t.key === "checkin" || t.key === "parking");
  const result = await runAi({
    teamId,
    userId,
    feature: FEATURE.CHECKIN_GUIDE,
    maxTokens: 1500,
    system: `${BASE_SYSTEM} You write warm, crystal-clear arrival guides for guests.`,
    prompt: `Rewrite this listing's arrival guide so guests never get stuck at check-in.

Listing: ${p.listingName ?? p.internalName}
Location: ${clip(p.location, 150) || "not given"}
Current check-in notes: ${redactCodes(p.checkInInfo) || "none"}
Parking notes: ${redactCodes(p.parkingInfo) || "none"}
Check-out notes: ${redactCodes(p.checkoutInfo) || "none"}
House rules: ${clip(redactCodes(p.rules), 1200) || "none"}
Check-in rating: ${ctx.snapshot?.checkin ?? "unknown"}
What guests struggled with: ${complaints ? complaints.quotes.map((q) => q.text).join(" / ") : "no complaints imported"}

Rules:
- Use these exact placeholders and never invent codes or passwords: {{DOOR_CODE}}, {{WIFI_NAME}}, {{WIFI_PASSWORD}}.
- Short sections with headings: Before you arrive, Getting in, Parking, Wi-Fi, During your stay, Check-out, Need help?
- Numbered steps where order matters. Plain text, no markdown tables. Under 350 words.
- If a detail is missing, write "[team: add …]" so the team knows what to fill in.`,
  });
  return save(propertyId, "CHECKIN_GUIDE", { text: result.text.trim().slice(0, 6000) } satisfies TextContent, { ...result, userId });
}

export async function generateCopy(teamId: string, userId: string, propertyId: string) {
  const ctx = await loadContext(propertyId, teamId);
  const s = ctx.snapshot;
  const result = await runAi({
    teamId,
    userId,
    feature: FEATURE.COPY,
    maxTokens: 1200,
    system: `${BASE_SYSTEM} You are also an Airbnb listing copywriter. Reply with JSON only.`,
    prompt: `Current title: ${ctx.property.listingName ?? "none"}
Current description (start): ${clip(ctx.property.description, 2500) || "none"}
Amenities: ${clip((s?.amenities ?? ctx.property.amenities).join(", "), 1500)}
Bedrooms ${ctx.property.bedrooms ?? "?"}, beds ${ctx.property.beds ?? "?"}, baths ${ctx.property.bathrooms ?? "?"}, sleeps ${ctx.property.guestCapacity ?? "?"}
Location: ${clip(ctx.property.location, 150) || "unknown"}
What guests praise most (Airbnb review tags): ${((s?.reviewTags as { name: string; count: number }[] | null) ?? []).map((t) => t.name).join(", ") || "n/a"}

Suggest better listing copy. JSON exactly:
{"titles": ["3 title options, each MAX 50 characters, lead with the strongest hook"],
 "opening": "a 2-3 sentence description opening that sells the stay",
 "highlights": ["5 short bullet highlights"],
 "captionIdeas": ["5 photo caption ideas for key rooms/features"]}
Only use features that appear in the data.`,
  });
  const json = extractJson<CopyContent>(result.text);
  if (!json?.titles?.length) throw new AiError("The AI reply wasn't in the expected format. Try again.", 502);
  const content: CopyContent = {
    // Airbnb's hard limit — drop anything longer rather than show it.
    titles: json.titles.map((t) => clip(t, 80)).filter((t) => t.length > 0 && t.length <= 50).slice(0, 5),
    opening: clip(json.opening, 700),
    highlights: (json.highlights ?? []).slice(0, 6).map((x) => clip(x, 160)),
    captionIdeas: (json.captionIdeas ?? []).slice(0, 6).map((x) => clip(x, 120)),
  };
  return save(propertyId, "COPY", content, { ...result, userId });
}

export async function generateReviewReply(teamId: string, userId: string, reviewId: string) {
  const review = await prisma.listingReview.findFirst({ where: { id: reviewId, property: { client: { teamId } } }, include: { property: true } });
  if (!review) throw new AiError("Review not found.", 404);
  const result = await runAi({
    teamId,
    userId,
    feature: FEATURE.REVIEW_REPLY,
    maxTokens: 600,
    system: `${BASE_SYSTEM} You write public host responses to Airbnb reviews.`,
    prompt: `Listing: ${review.property.listingName ?? review.property.internalName}
Guest rating: ${review.rating}★
Public review: ${clip(review.comment, 1500)}
${review.privateNote ? `Private feedback (context only; never quote or reveal it): ${clip(redactCodes(review.privateNote), 600)}` : ""}

Write the host's public response:
- Thank the guest by first name if one is obvious, otherwise no name.
- Acknowledge the specific points calmly; never argue, blame the guest or share private details.
- Don't claim something was fixed unless the review says so; say it has been passed to the team to address.
- Future guests will read it: show care and professionalism.
- 60 to 120 words, plain text, no sign-off placeholder.`,
  });
  return save(review.propertyId, "REVIEW_REPLY", { text: result.text.trim().slice(0, 2000) } satisfies TextContent, { ...result, userId, reviewId });
}

/** Non-AI arrival guide built straight from Knowledge Base fields — always available. */
export function templateCheckinGuide(p: {
  listingName: string | null;
  internalName: string;
  checkInInfo: string | null;
  parkingInfo: string | null;
  checkoutInfo: string | null;
  wifiName: string | null;
  rules: string | null;
}) {
  const or = (v: string | null, missing: string) => (v && v.trim() ? v.trim() : `[team: add ${missing}]`);
  return [
    `Welcome to ${p.listingName ?? p.internalName}!`,
    "",
    "Getting in",
    or(p.checkInInfo, "check-in steps"),
    "Door code: {{DOOR_CODE}}",
    "",
    "Parking",
    or(p.parkingInfo, "where to park"),
    "",
    "Wi-Fi",
    `Network: {{WIFI_NAME}}${p.wifiName ? "" : " [team: add Wi-Fi name]"}`,
    "Password: {{WIFI_PASSWORD}}",
    "",
    "Check-out",
    or(p.checkoutInfo, "check-out steps"),
    "",
    "House rules",
    or(p.rules, "house rules"),
    "",
    "Need help? Message us any time through the app.",
  ].join("\n");
}
