import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { differenceInMinutes } from "date-fns";

// All timestamps are stored in UTC in the database. This module is the ONLY
// place that converts to/from a team's display timezone.
//
// Every team has its own timezone (Team.timezone) — server code gets it from
// getTeamTimezone() (lib/team-timezone.ts), client components from
// useTeamTimezone() (components/providers/team-timezone.tsx). The `tz`
// argument is deliberately required everywhere: a default silently made
// every team behave as Asia/Dhaka.
//
// Two kinds of value, two kinds of formatter:
// - Instants (actualCheckIn, createdAt, "now") — formatted in the team's tz.
// - Calendar days (Task.date, AttendanceRecord.date, ShiftAssignment.date) —
//   stored as UTC midnight of that day, so they're formatted in UTC. Running
//   them through the team tz shifted every day back by one for any team west
//   of UTC; it only looked right because Asia/Dhaka is UTC+6.

/** Used only as the starting value for a newly created team. */
export const DEFAULT_TIMEZONE = "Asia/Dhaka";

export function isValidTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ---- Instants, in the team's timezone ----

export function formatTime(date: Date, tz: string) {
  return formatInTimeZone(date, tz, "h:mm a");
}

/** Same as formatTime; kept as the name client components already use. */
export const formatClientTime = formatTime;

export function formatClientDateTime(date: Date, tz: string) {
  return formatInTimeZone(date, tz, "MMM d, yyyy, h:mm a");
}

/** Short date of an instant (e.g. a notice's createdAt). */
export function formatClientShortDate(date: Date, tz: string) {
  return formatInTimeZone(date, tz, "d MMM");
}

/** "HH:mm" (24h) in the team's timezone — for pre-filling a time input from a
 *  stored instant, so it round-trips through combineDateAndTime. */
export function formatClientTime24(date: Date, tz: string) {
  return formatInTimeZone(date, tz, "HH:mm");
}

/** "yyyy-MM-dd" of the team's current calendar day — the same key
 *  startOfDayUTC produces, regardless of the browser's own timezone. */
export function clientDateKey(date: Date, tz: string) {
  return formatInTimeZone(date, tz, "yyyy-MM-dd");
}

export function formatDateLong(date: Date, tz: string) {
  return formatInTimeZone(date, tz, "EEEE, MMMM d, yyyy");
}

export function greeting(date: Date, tz: string) {
  const hour = Number(formatInTimeZone(date, tz, "H"));
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

// ---- Calendar days (UTC-midnight Dates) ----

export function dayKey(day: Date) {
  return formatInTimeZone(day, "UTC", "yyyy-MM-dd");
}

export function formatDayShort(day: Date) {
  return formatInTimeZone(day, "UTC", "d MMM");
}

export function formatDayMedium(day: Date) {
  return formatInTimeZone(day, "UTC", "MMM d, yyyy");
}

export function formatDayLong(day: Date) {
  return formatInTimeZone(day, "UTC", "d MMMM yyyy");
}

export function formatDayWeekday(day: Date) {
  return formatInTimeZone(day, "UTC", "EEEE");
}

export function formatDayFull(day: Date) {
  return formatInTimeZone(day, "UTC", "EEEE, MMMM d, yyyy");
}

export function formatWeekRange(weekStart: Date) {
  const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
  return `${formatDayShort(weekStart)} to ${formatInTimeZone(weekEnd, "UTC", "d MMM yyyy")}`;
}

// ---- Conversions ----

/** Parses "HH:mm" into a Date object for a given calendar day, in the team timezone,
 *  then returns the equivalent UTC Date for storage/comparison.
 *
 *  Uses `fromZonedTime` (not `toZonedTime` + `setHours`) deliberately: the
 *  previous implementation read/wrote the intermediate Date's hours via
 *  Date.prototype.getHours/setHours, which are resolved against the host
 *  process's own local timezone (`process.env.TZ`) — on Vercel that's UTC,
 *  so it happened to work in production, but it silently gave wrong results
 *  (off by the process/team tz offset difference) anywhere else, including
 *  local development.
 *
 *  `fromZonedTime(date, tz)` itself reads `date` via its *local* getters
 *  (getFullYear/getMonth/.../getHours — see date-fns-tz's own source and
 *  docs example `fromZonedTime(new Date(2014, 5, 25, 10, 0, 0), ...)`), not
 *  UTC getters, and treats those numbers as the wall clock in `tz`. The
 *  plain `Date` constructor always makes local getters equal exactly the
 *  arguments passed, independent of process timezone, so building the
 *  wall-clock Date that way — not via `Date.UTC(...)` — is what actually
 *  makes this conversion process-tz-independent. */
export function combineDateAndTime(day: Date, hhmm: string, tz: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const wallClock = new Date(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, m, 0, 0);
  return fromZonedTime(wallClock, tz);
}

/** A calendar day (UTC-midnight Date, e.g. parsed from "yyyy-MM-dd" or a
 *  roster's weekStart ISO) as noon of that day in the team's timezone — an
 *  instant that's unambiguously that day for startOfDayUTC/startOfWeekMonday.
 *  Passing the raw UTC-midnight Date instead lands on the previous day for
 *  any team west of UTC. */
export function dayAsTeamInstant(day: Date, tz: string) {
  return combineDateAndTime(day, "12:00", tz);
}

/** dayAsTeamInstant for an ISO date/datetime string from the browser —
 *  only its "yyyy-MM-dd" part is used. */
export function parseDayParam(value: string, tz: string) {
  return dayAsTeamInstant(new Date(`${value.slice(0, 10)}T00:00:00.000Z`), tz);
}

/** "yyyy-MM-ddTHH:mm" in the team's timezone, for an <input type="datetime-local">. */
export function toLocalInputValue(date: Date, tz: string) {
  return formatInTimeZone(date, tz, "yyyy-MM-dd'T'HH:mm");
}

/** Parses an <input type="datetime-local"> value as wall-clock time in the
 *  team's timezone — never the browser's (which `new Date(value)` would use). */
export function fromLocalInputValue(value: string, tz: string) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value);
  if (!m) return null;
  return combineDateAndTime(new Date(`${m[1]}T00:00:00.000Z`), m[2], tz);
}

export function minutesLate(scheduled: Date, actual: Date) {
  return Math.max(0, differenceInMinutes(actual, scheduled));
}

export function formatMinutesAsHm(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

export function dayOfWeekInTz(date: Date, tz: string) {
  // 0 = Sunday .. 6 = Saturday, per the team's local calendar day
  const label = formatInTimeZone(date, tz, "EEEE");
  const map: Record<string, number> = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
  };
  return map[label];
}

/** The team's current calendar day for `date`, as a UTC-midnight Date. */
export function startOfDayUTC(date: Date, tz: string) {
  return new Date(`${clientDateKey(date, tz)}T00:00:00.000Z`);
}

/** Monday of the week containing `date`, as a UTC-midnight Date, in team-tz terms. */
export function startOfWeekMonday(date: Date, tz: string): Date {
  const dow = dayOfWeekInTz(date, tz); // 0=Sun..6=Sat
  const diffToMonday = dow === 0 ? -6 : 1 - dow; // Sunday rolls back 6 days
  const base = startOfDayUTC(date, tz);
  return new Date(base.getTime() + diffToMonday * 24 * 60 * 60 * 1000);
}

/** The 7 UTC-midnight day Dates (Mon..Sun) for the week starting at `weekStart`. */
export function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * 24 * 60 * 60 * 1000));
}

/** Duration in minutes between two "HH:mm" strings, correctly handling shifts that
 *  cross midnight (e.g. Evening 17:00 -> 01:00 is 8 hours, not negative). */
export function shiftDurationMinutes(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  let minutes = eh * 60 + em - (sh * 60 + sm);
  if (minutes <= 0) minutes += 24 * 60; // crosses midnight
  return minutes;
}
