// Server-side ONLY. Never import this from a client component.
// Webhook URLs / bot tokens live in process.env and are never sent to the browser.

import { formatTime, formatDateLong, formatMinutesAsHm } from "@/lib/time";

type CheckInPayload = {
  employeeName: string;
  teamName: string;
  date: Date;
  actualCheckIn: Date;
  scheduledCheckIn?: string | null;
  isLate: boolean;
  lateMinutes?: number;
};

type CheckOutPayload = {
  employeeName: string;
  teamName: string;
  date: Date;
  actualCheckIn: Date | null;
  actualCheckOut: Date;
  totalMinutes: number | null;
};

async function postToWebhook(url: string, content: string): Promise<{ ok: boolean; error?: string }> {
  if (!url) {
    return { ok: false, error: "Webhook URL not configured" };
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `Discord returned ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Unknown network error" };
  }
}

export async function sendCheckInNotification(payload: CheckInPayload) {
  const emoji = payload.isLate ? "🟡" : "🟢";
  const statusLine = payload.isLate
    ? `Status: Late by ${payload.lateMinutes} minutes`
    : "Status: On Time";

  const content = [
    `${emoji} **Employee Check-In**`,
    ``,
    `Employee: ${payload.employeeName}`,
    `Team: ${payload.teamName}`,
    `Date: ${formatDateLong(payload.date)}`,
    `Check-in Time: ${formatTime(payload.actualCheckIn)}`,
    payload.scheduledCheckIn ? `Scheduled Time: ${payload.scheduledCheckIn}` : null,
    statusLine,
    `Source: Charlie HQ`,
  ]
    .filter(Boolean)
    .join("\n");

  return postToWebhook(process.env.DISCORD_CHECKIN_WEBHOOK_URL || "", content);
}

export async function sendCheckOutNotification(payload: CheckOutPayload) {
  const content = [
    `🔴 **Employee Check-Out**`,
    ``,
    `Employee: ${payload.employeeName}`,
    `Team: ${payload.teamName}`,
    `Date: ${formatDateLong(payload.date)}`,
    payload.actualCheckIn ? `Check-in: ${formatTime(payload.actualCheckIn)}` : `Check-in: Missing`,
    `Check-out: ${formatTime(payload.actualCheckOut)}`,
    payload.totalMinutes != null
      ? `Total Working Hours: ${formatMinutesAsHm(payload.totalMinutes)}`
      : `Total Working Hours: N/A`,
    `Source: Charlie HQ`,
  ].join("\n");

  return postToWebhook(process.env.DISCORD_CHECKOUT_WEBHOOK_URL || "", content);
}

export async function sendTestNotification(kind: "checkin" | "checkout") {
  const url =
    kind === "checkin"
      ? process.env.DISCORD_CHECKIN_WEBHOOK_URL || ""
      : process.env.DISCORD_CHECKOUT_WEBHOOK_URL || "";
  const content = `✅ **Charlie HQ Test Notification**\n\nThis is a test of the ${kind} channel connection.\nSource: Charlie HQ`;
  return postToWebhook(url, content);
}
