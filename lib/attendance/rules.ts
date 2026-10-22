// Pure attendance rules — no database, no clock reads. Everything that
// decides "how many hours does this count as" or "when does this stop" lives
// here so it can be tested in isolation (scripts/test-attendance-rules.ts).
// The reasoning behind each rule is in docs/attendance-rules.md.

import { combineDateAndTime } from "@/lib/time";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How far ahead of a scheduled start a check-in still belongs to that shift. */
export const EARLY_CHECK_IN_WINDOW_MINUTES = 4 * 60;
/** Company policy: total working time incl. overtime per day (warning only). */
export const DAILY_LIMIT_HOURS = 10;

export type ReviewState = "NONE" | "PENDING" | "APPROVED" | "REJECTED";

/** Absolute start/end for a shift on `day` (UTC-midnight calendar day). An end
 *  at or before the start means the shift finishes the next day. */
export function shiftWindow(day: Date, start: string, end: string, tz: string) {
  const startAt = combineDateAndTime(day, start, tz);
  let endAt = combineDateAndTime(day, end, tz);
  if (endAt.getTime() <= startAt.getTime()) {
    endAt = combineDateAndTime(new Date(day.getTime() + DAY), end, tz);
  }
  return { startAt, endAt };
}

export function minutesBetween(a: Date, b: Date) {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / MINUTE));
}

export type ShiftCandidate = { date: Date; startAt: Date; endAt: Date };

/** The scheduled shift a check-in at `now` belongs to: one whose window
 *  [start - early window, end] contains now, nearest start first. Null means
 *  an unscheduled check-in (dated to the team's current day by the caller). */
export function resolveShiftForCheckIn(candidates: ShiftCandidate[], now: Date): ShiftCandidate | null {
  const early = EARLY_CHECK_IN_WINDOW_MINUTES * MINUTE;
  const open = candidates.filter((c) => now.getTime() >= c.startAt.getTime() - early && now.getTime() <= c.endAt.getTime());
  if (open.length === 0) return null;
  return open.sort((a, b) => Math.abs(now.getTime() - a.startAt.getTime()) - Math.abs(now.getTime() - b.startAt.getTime()))[0];
}

/** When an open session with no check-out stops on its own: the later of
 *  check-in + cap and scheduled end + approved overtime, so a long scheduled
 *  shift or approved overtime is never cut short (conflict #1). */
export function autoStopAt(input: {
  checkIn: Date;
  shiftEndAt: Date | null;
  approvedOvertimeMinutes: number;
  capHours: number;
}) {
  const byCap = input.checkIn.getTime() + input.capHours * HOUR;
  const bySchedule = input.shiftEndAt ? input.shiftEndAt.getTime() + input.approvedOvertimeMinutes * MINUTE : 0;
  return new Date(Math.max(byCap, bySchedule));
}

export type RecordTimes = {
  actualCheckIn: Date | null;
  actualCheckOut: Date | null;
  effectiveCheckIn: Date | null;
  effectiveCheckOut: Date | null;
  claimedCheckIn: Date | null;
  autoClosedAt: Date | null;
  shiftStartAt: Date | null;
  shiftEndAt: Date | null;
  review: ReviewState;
};

export type Credit = {
  /** credited = counts toward approved hours; pending = waiting for review
   *  (provisional numbers); open = still working; none = nothing to count. */
  bucket: "credited" | "pending" | "open" | "none";
  workedMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  /** Worked outside the schedule and not covered by approved overtime —
   *  shown, never paid (conflict #4). */
  extraMinutes: number;
};

const ZERO = { workedMinutes: 0, regularMinutes: 0, overtimeMinutes: 0, extraMinutes: 0 };

/** Splits [start, end] into regular (inside the schedule), approved overtime
 *  (after the scheduled end, capped at the approved minutes) and extra. */
export function splitWorked(start: Date, end: Date, shiftStartAt: Date | null, shiftEndAt: Date | null, approvedOvertimeMinutes: number) {
  const worked = minutesBetween(start, end);
  if (!shiftStartAt || !shiftEndAt) {
    // Unscheduled day: nothing to compare against — all worked time is
    // regular; overtime still needs an approved request to count.
    const overtime = Math.min(approvedOvertimeMinutes, worked);
    return { workedMinutes: worked, regularMinutes: worked - overtime, overtimeMinutes: overtime, extraMinutes: 0 };
  }
  const overlapStart = Math.max(start.getTime(), shiftStartAt.getTime());
  const overlapEnd = Math.min(end.getTime(), shiftEndAt.getTime());
  const regular = Math.max(0, Math.round((overlapEnd - overlapStart) / MINUTE));
  const afterShift = minutesBetween(new Date(Math.max(start.getTime(), shiftEndAt.getTime())), end);
  const overtime = Math.min(afterShift, approvedOvertimeMinutes);
  return { workedMinutes: worked, regularMinutes: regular, overtimeMinutes: overtime, extraMinutes: Math.max(0, worked - regular - overtime) };
}

export function creditFor(r: RecordTimes, approvedOvertimeMinutes: number): Credit {
  if (r.review === "APPROVED") {
    const start = r.effectiveCheckIn ?? r.actualCheckIn;
    const end = r.effectiveCheckOut ?? r.actualCheckOut;
    if (!start || !end) return { bucket: "none", ...ZERO };
    return { bucket: "credited", ...splitWorked(start, end, r.shiftStartAt, r.shiftEndAt, approvedOvertimeMinutes) };
  }

  if (r.review === "REJECTED") {
    // Claim not accepted: only real punches count, and an auto-stopped
    // session with no real check-out counts as nothing.
    if (!r.actualCheckIn || !r.actualCheckOut) return { bucket: "none", ...ZERO };
    return { bucket: "credited", ...splitWorked(r.actualCheckIn, r.actualCheckOut, r.shiftStartAt, r.shiftEndAt, approvedOvertimeMinutes) };
  }

  if (r.review === "PENDING") {
    // Provisional: real punches where they exist; a forgotten check-out ends
    // at the scheduled end (scheduled time only — never the 10h auto-stop),
    // capped by the auto-stop itself (conflict #2).
    const start = r.actualCheckIn ?? r.claimedCheckIn;
    let end = r.actualCheckOut;
    if (!end && r.shiftEndAt) {
      end = r.autoClosedAt && r.autoClosedAt.getTime() < r.shiftEndAt.getTime() ? r.autoClosedAt : r.shiftEndAt;
    }
    if (!start || !end || end.getTime() <= start.getTime()) return { bucket: "pending", ...ZERO };
    return { bucket: "pending", ...splitWorked(start, end, r.shiftStartAt, r.shiftEndAt, approvedOvertimeMinutes) };
  }

  // NONE: clean punches.
  if (!r.actualCheckIn) return { bucket: "none", ...ZERO };
  if (!r.actualCheckOut) return { bucket: "open", ...ZERO };
  return { bucket: "credited", ...splitWorked(r.actualCheckIn, r.actualCheckOut, r.shiftStartAt, r.shiftEndAt, approvedOvertimeMinutes) };
}

/** Company limit check for an overtime approval (warning, not a block). */
export function exceedsDailyLimit(shiftStartAt: Date | null, shiftEndAt: Date | null, overtimeMinutes: number) {
  const scheduled = shiftStartAt && shiftEndAt ? minutesBetween(shiftStartAt, shiftEndAt) : 0;
  return scheduled + overtimeMinutes > DAILY_LIMIT_HOURS * 60;
}

/** Leads can't approve their own attendance/overtime; admins can, labelled. */
export function canReview(reviewer: { id: string; role: string }, subjectUserId: string) {
  if (reviewer.role !== "ADMIN" && reviewer.role !== "TEAM_LEAD") return false;
  if (reviewer.id === subjectUserId && reviewer.role !== "ADMIN") return false;
  return true;
}
