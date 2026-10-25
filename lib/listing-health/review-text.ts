// Reads reviews out of free text: a block copied from Airbnb's Reviews page,
// or an Airbnb "new review" email. Pure — tested in
// scripts/test-listing-health.ts. Anything it can't read with confidence is
// left null so a person fills it in (paste preview / Review inbox) rather
// than the app guessing a rating.

export type TextReview = {
  guestName: string | null;
  reviewDate: string | null; // yyyy-MM-dd
  rating: number | null; // 1–5, null when the text doesn't say
  comment: string;
  privateNote: string | null;
  listingRef: string | null; // Airbnb room id or a listing title, when present
};

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_RE = MONTHS.map((m) => m.slice(0, 3)).join("|");

/** "October 2026", "Oct 12, 2026", "12 October 2026", "2026-10-12", "10/12/2026" → yyyy-MM-dd. */
export function parseLooseDate(line: string): string | null {
  const s = line.trim().toLowerCase().replace(/,/g, "");
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  const monthIdx = (word: string) => MONTHS.findIndex((x) => x.startsWith(word.slice(0, 3)));
  m = s.match(new RegExp(`^(${MONTH_RE})[a-z]*\\.?\\s+(\\d{1,2})\\s+(\\d{4})$`));
  if (m) return `${m[3]}-${String(monthIdx(m[1]) + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  m = s.match(new RegExp(`^(\\d{1,2})\\s+(${MONTH_RE})[a-z]*\\.?\\s+(\\d{4})$`));
  if (m) return `${m[3]}-${String(monthIdx(m[2]) + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(new RegExp(`^(${MONTH_RE})[a-z]*\\.?\\s+(\\d{4})$`));
  if (m) return `${m[2]}-${String(monthIdx(m[1]) + 1).padStart(2, "0")}-01`;
  return null;
}

/** A star rating stated in text: "Rating, 4 stars", "5-star", "4 out of 5", "Rated 3", "★★★★". */
export function ratingInText(text: string): number | null {
  const t = text.toLowerCase();
  const pick = (re: RegExp) => {
    const m = t.match(re);
    const n = m ? Number(m[1]) : NaN;
    return n >= 1 && n <= 5 ? Math.round(n) : null;
  };
  const stars = (text.match(/★/g) ?? []).length;
  return (
    pick(/(\d(?:\.\d)?)\s*out of\s*5/) ??
    pick(/rating[,:]?\s*(\d(?:\.\d)?)\s*stars?/) ??
    pick(/(\d)\s*-\s*star/) ??
    pick(/\b(\d)\s+stars?\b/) ??
    pick(/rated(?: (?:you|your stay|the stay|it))?\s*(\d)\b/) ??
    (stars >= 1 && stars <= 5 ? stars : null)
  );
}

// Interface text that ends up in a copy of Airbnb's pages but isn't the review.
const NOISE = [
  /^(show|read) (more|less|original|translation)\b/i,
  /^translated from\b/i,
  /^translate\b/i,
  /^(respond|reply|write a response|edit response|report)\b/i,
  /^(public review|reviews?|overall rating|rating)$/i,
  /^(cleanliness|accuracy|check-?in|communication|location|value)\s*[\d.]*$/i,
  /^\d(\.\d+)?$/,
  /^·$/,
  /^stayed (a few nights|about a week|one night|with kids|with a pet)/i,
  /^(\d+ (years?|months?) on airbnb)$/i,
];

const isNoise = (line: string) => NOISE.some((re) => re.test(line.trim()));

/**
 * Splits text copied from Airbnb's host Reviews page (or a listing's review
 * list) into reviews. A review starts with a guest name followed by a date
 * line ("October 2026", "2 weeks ago" is skipped as a date we can't place).
 */
export function parsePastedReviews(text: string): TextReview[] {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Start of a review: a short name-like line right before a date line.
  const starts: { at: number; date: string }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const date = parseLooseDate(lines[i]) ?? parseLooseDate(lines[i].replace(/^.*?·\s*/, ""));
    const name = lines[i - 1];
    if (date && name.length <= 40 && !/[.!?]$/.test(name) && !parseLooseDate(name) && !isNoise(name)) {
      starts.push({ at: i - 1, date });
    }
  }

  const out: TextReview[] = [];
  starts.forEach((s, k) => {
    const end = k + 1 < starts.length ? starts[k + 1].at : lines.length;
    const block = lines.slice(s.at + 2, end);
    const comment: string[] = [];
    const privateLines: string[] = [];
    let mode: "comment" | "private" | "response" = "comment";
    for (const line of block) {
      if (/^(response from|your response|host response|reply from)\b/i.test(line)) {
        mode = "response";
        continue;
      }
      if (/^private (note|feedback)\b/i.test(line)) {
        mode = "private";
        const rest = line.replace(/^private (note|feedback)[:\s-]*/i, "");
        if (rest) privateLines.push(rest);
        continue;
      }
      if (isNoise(line) || ratingInText(line) !== null && line.length < 30) continue;
      if (mode === "comment") comment.push(line);
      else if (mode === "private") privateLines.push(line);
    }
    const blockText = lines.slice(s.at, end).join("\n");
    const text = comment.join(" ").trim();
    if (!text) return;
    out.push({
      guestName: lines[s.at],
      reviewDate: s.date,
      rating: ratingInText(blockText.split(/response from|your response/i)[0]),
      comment: text,
      privateNote: privateLines.join(" ").trim() || null,
      listingRef: null,
    });
  });
  return out;
}

/** Room id from any Airbnb link in the text (rooms/123, listings/123, listing_id=123). */
export function airbnbRoomId(text: string): string | null {
  return text.match(/airbnb\.[a-z.]+\/(?:rooms|hosting\/listings(?:\/editor)?|manage-your-space)\/(\d{5,})/i)?.[1] ?? text.match(/listing_id=(\d{5,})/i)?.[1] ?? null;
}

/** Is this email an Airbnb notification about a guest review? */
export function looksLikeReviewEmail(subject: string, from: string) {
  return /airbnb/i.test(from) && /review/i.test(subject) && !/(write|leave|left you a reminder|reminder to review|review your guest|review .* guest)/i.test(subject);
}

/**
 * Reads an Airbnb "you received a review" email. The comment is the quoted
 * text when there is one; when the email only links to the review the
 * comment comes back empty and the item waits in the Review inbox.
 */
export function parseReviewEmail(input: { subject: string; body: string }): TextReview {
  const { subject, body } = input;
  const flat = body.replace(/\r/g, "");
  const name =
    subject.match(/^(.+?) (?:left|gave|wrote)\b/i)?.[1] ??
    subject.match(/^read (.+?)['’]s review/i)?.[1] ??
    subject.match(/review from (.+?)(?: for|$)/i)?.[1] ??
    null;

  // Quoted review text: “…” or "…" spanning at least a few words.
  const quoted = flat.match(/[“"]([^”"]{20,})[”"]/)?.[1];
  // Or the paragraph after a "… wrote:" / "… said:" line.
  const after = flat.match(/(?:wrote|said|review)[:\s]*\n+([\s\S]{20,}?)(?:\n\s*\n|$)/i)?.[1];
  const comment = (quoted ?? after ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !isNoise(l) && !/^https?:\/\//i.test(l))
    .join(" ")
    .trim();

  // The listing title often follows "for" in the subject: "… review for Jaeger Haus".
  const titleRef = subject.match(/ for (.+?)[!.]?$/i)?.[1] ?? null;

  return {
    guestName: name?.trim().replace(/^(your guest|guest)\s+/i, "") || null,
    reviewDate: null,
    rating: ratingInText(subject) ?? ratingInText(flat.slice(0, 1500)),
    comment,
    privateNote: null,
    listingRef: airbnbRoomId(flat) ?? titleRef,
  };
}
