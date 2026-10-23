import { createHash } from "crypto";

// Review import: accepts the CSV exports PMSs produce (Guesty, Hostaway,
// Hospitable…) or a hand-made sheet. Columns are matched by header name, so
// exact formats don't matter. Pure functions — tested in
// scripts/test-listing-health.ts.

/** RFC 4180-ish CSV parser: quoted fields, escaped quotes, newlines in quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

export type ColumnMap = { rating: number; comment: number; date: number; guest: number; privateNote: number; listing: number };

const HEADER_PATTERNS: Record<keyof ColumnMap, RegExp[]> = {
  rating: [/^(overall[ _]?)?rating$/i, /^stars?$/i, /overall/i, /rating/i, /score/i],
  comment: [/^(public[ _]?)?review$/i, /public/i, /comment/i, /review[ _]?text/i, /^review/i, /^text$/i, /feedback/i],
  privateNote: [/private/i],
  date: [/date/i, /submitted|created|posted/i],
  guest: [/guest/i, /reviewer/i, /author/i, /^name$/i],
  listing: [/listing[ _]?id/i, /airbnb/i, /listing/i, /property/i, /unit/i, /url/i],
};

/** Picks a column for each field by header name; -1 when absent. */
export function mapColumns(header: string[]): ColumnMap {
  const used = new Set<number>();
  const pick = (field: keyof ColumnMap) => {
    for (const pattern of HEADER_PATTERNS[field]) {
      const idx = header.findIndex((h, i) => !used.has(i) && pattern.test(h.trim()));
      if (idx >= 0) {
        used.add(idx);
        return idx;
      }
    }
    return -1;
  };
  // Order matters: claim the specific columns ("private feedback") before the
  // broad ones ("feedback", "review") can grab them.
  const privateNote = pick("privateNote");
  const rating = pick("rating");
  const comment = pick("comment");
  const date = pick("date");
  const guest = pick("guest");
  const listing = pick("listing");
  return { rating, comment, date, guest, privateNote, listing };
}

/** "5", "4.0", "4/5", "★★★★", "4 stars", "80%" (of 5) → 1–5, else null. */
export function parseRating(value: string): number | null {
  const v = value.trim();
  if (!v) return null;
  const stars = (v.match(/★/g) ?? []).length;
  if (stars) return stars >= 1 && stars <= 5 ? stars : null;
  const pct = v.match(/^(\d+(?:\.\d+)?)\s*%$/);
  if (pct) return clampStar(Math.round((Number(pct[1]) / 100) * 5));
  const frac = v.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+)/);
  if (frac) return clampStar(Math.round((Number(frac[1]) / Number(frac[2])) * 5));
  const n = Number(v.match(/\d+(?:\.\d+)?/)?.[0]);
  if (!Number.isFinite(n)) return null;
  // Some exports use a 10-point scale.
  return clampStar(Math.round(n > 5 && n <= 10 ? n / 2 : n));
}

function clampStar(n: number) {
  return n >= 1 && n <= 5 ? n : null;
}

export function parseDate(value: string): Date | null {
  const v = value.trim();
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export function reviewFingerprint(input: { rating: number; comment: string; reviewDate: Date | null }) {
  const normalized = input.comment.toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("sha256")
    .update(`${input.rating}|${input.reviewDate ? input.reviewDate.toISOString().slice(0, 10) : ""}|${normalized}`)
    .digest("hex")
    .slice(0, 40);
}

export type ParsedReviewRow = {
  line: number;
  rating: number;
  comment: string;
  reviewDate: Date | null;
  guestName: string | null;
  privateNote: string | null;
  listingRef: string | null;
};

/** Parses a reviews CSV into rows + a list of problems for the import report. */
export function parseReviewsCsv(text: string) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { rows: [] as ParsedReviewRow[], skipped: [] as { line: number; reason: string }[], columns: null as ColumnMap | null };
  const columns = mapColumns(rows[0]);
  const skipped: { line: number; reason: string }[] = [];
  const out: ParsedReviewRow[] = [];
  if (columns.rating < 0 || columns.comment < 0) {
    return { rows: out, skipped: [{ line: 1, reason: "Couldn't find a rating column and a review/comment column in the header row." }], columns };
  }
  rows.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const cell = (idx: number) => (idx >= 0 ? (cells[idx] ?? "").trim() : "");
    const rating = parseRating(cell(columns.rating));
    const comment = cell(columns.comment);
    const privateNote = cell(columns.privateNote) || null;
    if (rating === null) return skipped.push({ line, reason: "No 1–5 rating" });
    if (!comment && !privateNote) return skipped.push({ line, reason: "Empty review text" });
    out.push({
      line,
      rating,
      comment: comment || "(no public review)",
      reviewDate: parseDate(cell(columns.date)),
      guestName: cell(columns.guest) || null,
      privateNote,
      listingRef: cell(columns.listing) || null,
    });
  });
  return { rows: out, skipped, columns };
}
