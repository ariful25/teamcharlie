import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { format, differenceInMinutes } from "date-fns";

// All timestamps are stored in UTC in the database. This module is the ONLY
// place that should convert to/from the team's display timezone, so that
// timezone becomes a Settings-configurable value later without touching
// business logic elsewhere.
export const TEAM_TIMEZONE = process.env.TEAM_TIMEZONE || "Asia/Dhaka";
export const CLIENT_TEAM_TIMEZONE = process.env.NEXT_PUBLIC_TEAM_TIMEZONE || "Asia/Dhaka";

export function nowInTeamTz(tz: string = TEAM_TIMEZONE) {
  return toZonedTime(new Date(), tz);
}

export function formatTime(date: Date, tz: string = TEAM_TIMEZONE) {
  return formatInTimeZone(date, tz, "h:mm a");
}

export function formatClientTime(date: Date, tz: string = CLIENT_TEAM_TIMEZONE) {
  return formatInTimeZone(date, tz, "h:mm a");
}

export function formatClockTime(date: Date) {
  return format(date, "h:mm a");
}

export function formatWeekday(date: Date) {
  return format(date, "EEEE");
}

export function formatClientWeekday(date: Date, tz: string = CLIENT_TEAM_TIMEZONE) {
  return formatInTimeZone(date, tz, "EEEE");
}

export function formatShortDate(date: Date) {
  return format(date, "d MMM");
}

export function formatClientShortDate(date: Date, tz: string = CLIENT_TEAM_TIMEZONE) {
  return formatInTimeZone(date, tz, "d MMM");
}

export function formatClientDate(date: Date, tz: string = CLIENT_TEAM_TIMEZONE) {
  return formatInTimeZone(date, tz, "MMM d, yyyy");
}

export function formatLongDate(date: Date) {
  return format(date, "d MMMM yyyy");
}

export function formatClientLongDate(date: Date, tz: string = CLIENT_TEAM_TIMEZONE) {
  return formatInTimeZone(date, tz, "d MMMM yyyy");
}

export function formatDateLong(date: Date, tz: string = TEAM_TIMEZONE) {
  return formatInTimeZone(date, tz, "EEEE, MMMM d, yyyy");
}

/** Parses "HH:mm" into a Date object for a given calendar day, in the team timezone,
 *  then returns the equivalent UTC Date for storage/comparison. */
export function combineDateAndTime(day: Date, hhmm: string, tz: string = TEAM_TIMEZONE): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const zoned = toZonedTime(day, tz);
  zoned.setHours(h, m, 0, 0);
  // toZonedTime gives a Date whose local getters reflect tz; construct UTC equivalent
  const utcMillis = zoned.getTime() - getTzOffsetMillis(zoned, tz);
  return new Date(utcMillis);
}

function getTzOffsetMillis(date: Date, tz: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date).reduce((acc: any, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const asUTC = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour === "24" ? 0 : parts.hour,
    parts.minute,
    parts.second
  );
  return asUTC - date.getTime();
}

export function minutesLate(scheduled: Date, actual: Date) {
  return Math.max(0, differenceInMinutes(actual, scheduled));
}

export function formatMinutesAsHm(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

export function greeting(date: Date = new Date(), tz: string = TEAM_TIMEZONE) {
  const hour = Number(formatInTimeZone(date, tz, "H"));
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

export function dayOfWeekInTz(date: Date, tz: string = TEAM_TIMEZONE) {
  // 0 = Sunday .. 6 = Saturday, per the team's local calendar day
  const label = formatInTimeZone(date, tz, "EEEE");
  const map: Record<string, number> = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
  };
  return map[label];
}

export function startOfDayUTC(date: Date, tz: string = TEAM_TIMEZONE) {
  const dayStr = formatInTimeZone(date, tz, "yyyy-MM-dd");
  return new Date(`${dayStr}T00:00:00.000Z`);
}

/** Monday of the week containing `date`, as a UTC-midnight Date, in team-tz terms. */
export function startOfWeekMonday(date: Date, tz: string = TEAM_TIMEZONE): Date {
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

export function formatWeekRange(weekStart: Date, tz: string = TEAM_TIMEZONE) {
  const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
  const startLabel = formatInTimeZone(weekStart, tz, "d MMM");
  const endLabel = formatInTimeZone(weekEnd, tz, "d MMM yyyy");
  return `${startLabel} – ${endLabel}`;
}
