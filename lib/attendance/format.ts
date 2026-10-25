import { formatInTimeZone } from "date-fns-tz";

// Display helpers shared by server and client attendance components.

export function hm(minutes: number) {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** "Tue 20 Oct" for a yyyy-MM-dd shift day (calendar day — no timezone shift). */
export function dayLabel(dayKey: string, pattern = "EEE d MMM") {
  return formatInTimeZone(new Date(`${dayKey}T00:00:00.000Z`), "UTC", pattern);
}

export function timeIn(isoValue: string | null, tz: string) {
  return isoValue ? formatInTimeZone(new Date(isoValue), tz, "h:mm a") : "·";
}

/** "20:00 → 05:00 (+1)" — makes overnight shifts obvious. */
export function scheduleLabel(v: { scheduledCheckIn: string | null; scheduledCheckOut: string | null }) {
  if (!v.scheduledCheckIn || !v.scheduledCheckOut) return "Not scheduled";
  const overnight = v.scheduledCheckOut <= v.scheduledCheckIn ? " (+1)" : "";
  return `${v.scheduledCheckIn} → ${v.scheduledCheckOut}${overnight}`;
}
