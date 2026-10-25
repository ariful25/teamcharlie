import { airbnbRoomId, parseReviewEmail, ratingInText } from "@/lib/listing-health/review-text";

// Classifies and reads Airbnb's host notification emails. Pure — tested in
// scripts/test-reviews.ts. Only reservation lifecycle and review emails are
// handled; guest chat messages are never ingested (the Gmail script doesn't
// fetch them, and they classify as OTHER here anyway).

export type EmailKind = "CONFIRMED" | "ALTERED" | "CANCELLED" | "CHECKOUT" | "GUEST_REVIEW" | "OTHER";

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
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function classifyEmail(subject: string, from: string): EmailKind {
  if (!/airbnb/i.test(from)) return "OTHER";
  const s = subject.trim();
  // Replies in a guest conversation ("RE: Reservation at …") are messages.
  if (/^(re|fwd?):/i.test(s) || /\bmessage\b/i.test(s) || /inquiry/i.test(s)) return "OTHER";
  if (/cancel+ed|cancellation/i.test(s)) return "CANCELLED";
  if (/alter|change(d)? (to|request)|reservation (updated|changed|modified)|updated reservation/i.test(s)) return "ALTERED";
  if (/(reservation|booking) confirmed|new (booking|reservation)|instant book/i.test(s)) return "CONFIRMED";
  if (/(write|leave) a review|review your guest|how was .*stay|rate your guest|review .+ (before|by)|reminder.*review/i.test(s)) return "CHECKOUT";
  if (/left (a|you a|an?) .*review|review from|read .+['’]s review|new review|reviewed (you|your)/i.test(s)) return "GUEST_REVIEW";
  return "OTHER";
}

/** "Thu, Oct 30" / "Oct 30, 2026" / "30 Oct" near a label → yyyy-MM-dd, using the email date to pick the year. */
export function dateNear(text: string, label: RegExp, emailDate: Date): string | null {
  const m = text.match(new RegExp(`${label.source}[^\\n]*\\n?[^\\n]*`, "i"));
  if (!m) return null;
  const chunk = m[0];
  const md = chunk.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?!\d)(?:,?\s+(\d{4}))?/i);
  const dm = chunk.match(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:,?\s+(\d{4}))?/i);
  const iso = chunk.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  let month: number, day: number, year: number | null;
  if (md) {
    month = MONTHS.indexOf(md[1].slice(0, 3).toLowerCase());
    day = Number(md[2]);
    year = md[3] ? Number(md[3]) : null;
  } else if (dm) {
    month = MONTHS.indexOf(dm[2].slice(0, 3).toLowerCase());
    day = Number(dm[1]);
    year = dm[3] ? Number(dm[3]) : null;
  } else return null;
  if (year === null) {
    // No year printed: the first such date on/after ~2 months before the email.
    year = emailDate.getUTCFullYear();
    const candidate = Date.UTC(year, month, day);
    if (candidate < emailDate.getTime() - 60 * 86_400_000) year++;
  }
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function guestFromSubject(subject: string): string | null {
  const s = subject.trim();
  return (
    s.match(/confirmed\s*[-–—:]\s*(.+?)\s+(?:arrives|is coming|checks in)/i)?.[1] ??
    s.match(/(?:review|rate)\s+(?:for\s+|your guest\s+)?(.+?)(?:\s+before|\s+by|[!.]|$)/i)?.[1] ??
    s.match(/^(.+?)\s+(?:has\s+)?(?:cancel|altered|changed|requested)/i)?.[1] ??
    s.match(/reservation (?:with|for) (.+?)(?: for| at|[!.]|$)/i)?.[1] ??
    null
  );
}

/** Rejects "names" that are really subject words ("Reservation HMABCD1234", "Your reservation"). */
function cleanGuest(name: string | null): string | null {
  const n = name?.replace(/^(guest|your guest)\s+/i, "").trim();
  if (!n || n.length > 60 || /\b(reservation|booking|your|HM[A-Z0-9]{8})\b/i.test(n)) return null;
  return n;
}

export function readAirbnbEmail(input: { subject: string; from: string; body: string; date: Date }): ReadEmail {
  const kind = classifyEmail(input.subject, input.from);
  const body = input.body.replace(/\r/g, "");
  const code = (input.subject + "\n" + body).match(/\b(HM[A-Z0-9]{8})\b/)?.[1] ?? null;
  const base: ReadEmail = {
    kind,
    confirmationCode: code,
    guestName: null,
    checkIn: null,
    checkOut: null,
    guests: null,
    listingRef: airbnbRoomId(body),
    rating: null,
    comment: "",
  };
  if (kind === "GUEST_REVIEW") {
    const r = parseReviewEmail({ subject: input.subject, body });
    return { ...base, guestName: r.guestName, listingRef: r.listingRef ?? base.listingRef, rating: r.rating ?? ratingInText(input.subject), comment: r.comment };
  }
  if (kind === "OTHER") return base;
  // Same line only — "Thu, Nov 5" above a "Guests" heading must not read as 5 guests.
  const guests = Number(body.match(/(\d+)[ \t]+(?:guests?|adults?)\b/i)?.[1]);
  return {
    ...base,
    guestName: cleanGuest(guestFromSubject(input.subject)) ?? cleanGuest(body.match(/^\s*([A-Z][\w'’-]+(?: [A-Z][\w'’-]+)?) (?:has )?(?:canceled|cancelled|changed|altered|checked out)\b/m)?.[1] ?? null),
    checkIn: dateNear(body, /check-?\s?in/, input.date),
    checkOut: dateNear(body, /check-?\s?out/, input.date),
    guests: Number.isFinite(guests) && guests > 0 && guests < 50 ? guests : null,
    listingRef: base.listingRef ?? input.subject.match(/ at (.+?)(?: for |$)/i)?.[1] ?? null,
  };
}
