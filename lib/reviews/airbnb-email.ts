import { airbnbRoomId, parseReviewEmail, ratingInText } from "@/lib/listing-health/review-text";

// Classifies and reads Airbnb's host notification emails. Pure — tested in
// scripts/test-reviews.ts against real email layouts (scripts/fixtures/).
// Only reservation lifecycle and review emails are handled; guest chat
// messages are never ingested (the Gmail script doesn't fetch them, and they
// classify as OTHER here anyway).
//
// What each real email carries (Oct 2026):
//   confirmed      code, full name, room link, "Check-in Checkout" + both dates on one line
//   change request first name, listing title, original + requested dates. No code.
//   updated        code, first name, listing title. No dates: they come from the request.
//   cancelled      code, first name, "Listing #id", "Oct 27 – 29"
//   checkout       "Write a review for Lena’s group". No code, listing or dates.
//   wrote you      the guest reviewed; text hidden until we review them. Title + dates.
//   n-star review  rating, (possibly cut) text, title + dates. "A recent guest" for low ratings.

export type EmailKind = "CONFIRMED" | "ALTER_REQUEST" | "ALTERED" | "CANCELLED" | "CHECKOUT" | "GUEST_REVIEW" | "OTHER";

export type ReadEmail = {
  kind: EmailKind;
  confirmationCode: string | null;
  guestName: string | null;
  checkIn: string | null; // yyyy-MM-dd
  checkOut: string | null;
  guests: number | null;
  listingRef: string | null;
  rating: number | null;
  comment: string;
  /** GUEST_REVIEW only: the guest reviewed but Airbnb hides it until we review them. */
  hidden?: boolean;
  /** ALTER_REQUEST only: the dates before the change (how we find the stay; the request has no code). */
  original?: [string, string] | null;
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MON = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?";

export function classifyEmail(subject: string, from: string): EmailKind {
  if (!/airbnb/i.test(from)) return "OTHER";
  const s = subject.trim();
  // Replies in a guest conversation ("RE: Reservation at …") are messages.
  if (/^(re|fwd?):/i.test(s) || /\bmessage\b/i.test(s) || /inquiry/i.test(s)) return "OTHER";
  if (/cancel+ed|cancellation/i.test(s)) return "CANCELLED";
  // A request isn't a change yet: "Rosa wants to change their reservation".
  if (/wants to change|requested (a )?change|change request|alteration request/i.test(s)) return "ALTER_REQUEST";
  if (/alter|changed to|reservation (updated|changed|modified)|updated reservation/i.test(s)) return "ALTERED";
  if (/(reservation|booking) confirmed|new (booking|reservation)|instant book/i.test(s)) return "CONFIRMED";
  if (/(write|leave) a review|review your guest|how was .*stay|rate your guest|review .+ (before|by)|reminder.*review/i.test(s)) return "CHECKOUT";
  if (/left (a|you a|an?) .*review|wrote you a review|rated (their|your) stay|review from|read .+['’]s review|new review|reviewed (you|your)/i.test(s)) return "GUEST_REVIEW";
  return "OTHER";
}

/** Month name + day (+ optional year) → yyyy-MM-dd. No year: the first such date on/after ~2 months before the email. */
function isoDate(mon: string, d: number, y: number | null, emailDate: Date): string {
  const month = MONTHS.indexOf(mon.slice(0, 3).toLowerCase());
  let year = y;
  if (year === null) {
    year = emailDate.getUTCFullYear();
    if (Date.UTC(year, month, d) < emailDate.getTime() - 60 * 86_400_000) year++;
  }
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "Thu, Oct 30" / "Oct 30, 2026" / "30 Oct" near a label → yyyy-MM-dd, using the email date to pick the year. */
export function dateNear(text: string, label: RegExp, emailDate: Date): string | null {
  const m = text.match(new RegExp(`${label.source}[^\\n]*\\n?[^\\n]*`, "i"));
  if (!m) return null;
  const chunk = m[0];
  const iso = chunk.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const md = chunk.match(new RegExp(`\\b${MON}\\s+(\\d{1,2})(?!\\d)(?:,?\\s+(\\d{4}))?`, "i"));
  if (md) return isoDate(md[1], Number(md[2]), md[3] ? Number(md[3]) : null, emailDate);
  const dm = chunk.match(new RegExp(`\\b(\\d{1,2})\\s+${MON}(?:,?\\s+(\\d{4}))?`, "i"));
  if (dm) return isoDate(dm[2], Number(dm[1]), dm[3] ? Number(dm[3]) : null, emailDate);
  return null;
}

/**
 * A stay's dates from one range: "Oct 27 – 29", "Oct 7 – 10, 2026",
 * "Jan 30 – Feb 2", "Oct 23, 2026 - Oct 26, 2026", or two dates side by side
 * ("Fri, Jan 15, 2027 Sun, Jan 17, 2027").
 */
export function dateRange(text: string, emailDate: Date): [string, string] | null {
  const re = new RegExp(
    `\\b${MON}\\s+(\\d{1,2})(?!\\d)(?:,\\s*(\\d{4}))?\\s*(?:[-–—]|to|(?:[A-Z][a-z]{2},\\s*))\\s*(?:${MON}\\s+)?(\\d{1,2})(?!\\d)(?:,\\s*(\\d{4}))?`,
    "i",
  );
  const m = text.match(re);
  if (!m) return null;
  const [, mon1, d1, y1, mon2, d2, y2] = m;
  const endMon = mon2 ?? mon1;
  const m1 = MONTHS.indexOf(mon1.slice(0, 3).toLowerCase());
  const m2 = MONTHS.indexOf(endMon.slice(0, 3).toLowerCase());
  let endYear = y2 ? Number(y2) : y1 ? Number(y1) : null;
  let startYear = y1 ? Number(y1) : endYear;
  if (startYear !== null && endYear !== null && !y2 && m2 < m1) endYear = startYear + 1; // Dec 30 – Jan 2, 2026
  if (!y1 && y2 && m1 > m2) startYear = Number(y2) - 1;
  const start = isoDate(mon1, Number(d1), startYear, emailDate);
  if (endYear === null) endYear = Number(start.slice(0, 4)) + (m2 < m1 ? 1 : 0);
  return [start, isoDate(endMon, Number(d2), endYear, emailDate)];
}

function guestFromSubject(subject: string): string | null {
  const s = subject.trim();
  return (
    s.match(/confirmed\s*[-–—:]\s*(.+?)\s+(?:arrives|is coming|checks in)/i)?.[1] ??
    s.match(/(?:review|rate)\s+(?:for\s+|your guest\s+)?(.+?)(?:\s+before|\s+by|[!.]|$)/i)?.[1] ??
    s.match(/^(.+?)\s+(?:has\s+)?(?:wants to change|cancel|altered|changed|requested)/i)?.[1] ??
    s.match(/reservation (?:with|for) (.+?)(?: for| at|[!.]|$)/i)?.[1] ??
    null
  );
}

/** Rejects "names" that are really subject words, and trims Airbnb's group wording ("Lena’s group", "Maureen and Kata"). */
export function cleanGuest(name: string | null): string | null {
  const n = name
    ?.replace(/^(guest|your guest)\s+/i, "")
    .replace(/['’]s group$/i, "")
    .replace(/\s+(?:and|&)\s+.+$/i, "")
    .trim();
  if (!n || n.length > 60 || /\b(reservation|booking|your|recent guest|a guest|HM[A-Z0-9]{8})\b/i.test(n)) return null;
  return n;
}

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());

/** The listing title, where each email layout puts it. */
function listingTitle(kind: EmailKind, body: string): string | null {
  const line = (re: RegExp) => body.match(re)?.[1]?.trim() || null;
  if (kind === "GUEST_REVIEW") {
    return (
      line(/FEEDBACK FROM THEIR STAY\s*\n\s*\n?\s*([^\n[]+)/) ?? // n-star review
      line(new RegExp(`\\n\\s*${MON.replace("(", "(?:")}\\s+\\d{1,2}\\s*[-–—][^\\n]*\\n\\s*([^\\n[]+)`, "i")) // "wrote you": title under the dates
    );
  }
  if (kind === "ALTER_REQUEST") return line(/^\s*·\s*(.+)$/m);
  if (kind === "ALTERED") {
    // Last plain line before the reservation link in brackets.
    const before = body.split(/\n\s*\[https:\/\/www\.airbnb\.[a-z.]+\/hosting\/reservations/i)[0];
    const lines = before.split("\n").map((l) => l.trim()).filter((l) => l && !/^https?:/i.test(l));
    return lines.length > 1 ? lines[lines.length - 1] : null;
  }
  if (kind === "CANCELLED") return line(/hosting\/reservations\/details\/\S+ ([^\n]+)/);
  return null;
}

export function readAirbnbEmail(input: { subject: string; from: string; body: string; date: Date }): ReadEmail {
  const kind = classifyEmail(input.subject, input.from);
  const body = input.body.replace(/\r/g, "");
  const code = (input.subject + "\n" + body).match(/\b(HM[A-Z0-9]{8})\b/)?.[1] ?? null;
  const roomId = airbnbRoomId(body) ?? body.match(/Listing #(\d{5,})/)?.[1] ?? null;
  const base: ReadEmail = {
    kind,
    confirmationCode: code,
    guestName: null,
    checkIn: null,
    checkOut: null,
    guests: null,
    listingRef: roomId ?? listingTitle(kind, body),
    rating: null,
    comment: "",
  };
  if (kind === "OTHER") return base;
  const range = dateRange(kind === "ALTER_REQUEST" ? (body.split(/REQUESTED DATES/i)[1] ?? "") : body, input.date);

  if (kind === "GUEST_REVIEW") {
    const r = parseReviewEmail({ subject: input.subject, body });
    const hidden = /wrote you a review|read .+ review after you write/i.test(input.subject + "\n" + body);
    return {
      ...base,
      guestName: cleanGuest(r.guestName),
      checkIn: range?.[0] ?? null,
      checkOut: range?.[1] ?? null,
      rating: hidden ? null : (r.rating ?? ratingInText(input.subject)),
      comment: hidden ? "" : r.comment,
      hidden,
    };
  }
  if (kind === "CHECKOUT") return { ...base, guestName: cleanGuest(guestFromSubject(input.subject)) };
  if (kind === "ALTER_REQUEST") {
    const was = body.match(/ORIGINAL DATES([\s\S]*?)REQUESTED DATES/i)?.[1];
    return {
      ...base,
      guestName: cleanGuest(guestFromSubject(input.subject)),
      checkIn: range?.[0] ?? null,
      checkOut: range?.[1] ?? null,
      original: was ? dateRange(was, input.date) : null,
    };
  }

  // Same line only — "Thu, Nov 5" above a "Guests" heading must not read as 5 guests.
  const guests = Number(body.match(/(\d+)[ \t]+(?:guests?|adults?)\b/i)?.[1]);
  // "Check-in Checkout" as one heading row: the dates sit side by side below it.
  const side = body.match(/check-?\s?in[ \t]+check-?\s?out[^\n]*\n\s*\n?([^\n]+)/i)?.[1];
  const sideRange = side ? dateRange(side, input.date) : null;
  const nameInBody =
    body.match(/your guest ([A-Z][\w'’-]+(?: [A-Z][\w'’-]+)?) (?:had to |has )?cancel/)?.[1] ??
    body.match(/reservation with ([\p{L}'’-]+) has been updated/iu)?.[1] ??
    body.match(/^\s*([A-Z][\w'’-]+(?: [A-Z][\w'’-]+)?) (?:has )?(?:canceled|cancelled|changed|altered|checked out)\b/m)?.[1] ??
    null;
  return {
    ...base,
    guestName: cleanGuest(guestFromSubject(input.subject)) ?? cleanGuest(nameInBody ? titleCase(nameInBody) : null),
    checkIn: sideRange?.[0] ?? dateNear(body, /check-?\s?in/, input.date) ?? range?.[0] ?? null,
    checkOut: sideRange?.[1] ?? dateNear(body, /check-?\s?out/, input.date) ?? range?.[1] ?? null,
    guests: Number.isFinite(guests) && guests > 0 && guests < 50 ? guests : null,
    listingRef: base.listingRef ?? input.subject.match(/ at (.+?)(?: for |$)/i)?.[1] ?? null,
  };
}
