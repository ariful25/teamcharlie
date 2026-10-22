// Server-side ONLY. Never import this from a client component.
// Webhook URLs / bot tokens are never sent to the browser. Which URL a
// message goes to is decided per team in lib/notifications.ts.

import { formatTime, formatDayFull, formatMinutesAsHm } from "@/lib/time";
import { PRODUCT_NAME } from "@/lib/brand";

type CheckInPayload = {
  employeeName: string;
  teamName: string;
  timezone: string;
  // Extra context line, e.g. "Auto-stopped after 10h — awaiting review".
  note?: string | null;
  date: Date;
  actualCheckIn: Date;
  scheduledCheckIn?: string | null;
  isLate: boolean;
  lateMinutes?: number;
};

type CheckOutPayload = {
  employeeName: string;
  teamName: string;
  timezone: string;
  // Extra context line, e.g. "Auto-stopped after 10h — awaiting review".
  note?: string | null;
  date: Date;
  actualCheckIn: Date | null;
  actualCheckOut: Date;
  totalMinutes: number | null;
};

export async function postToWebhook(url: string, content: string): Promise<{ ok: boolean; error?: string }> {
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

export async function sendCheckInNotification(payload: CheckInPayload, webhookUrl: string) {
  const emoji = payload.isLate ? "🟡" : "🟢";
  const statusLine = payload.isLate
    ? `Status: Late by ${payload.lateMinutes} minutes`
    : "Status: On Time";

  const content = [
    `${emoji} **Employee Check-In**`,
    ``,
    `Employee: ${payload.employeeName}`,
    `Team: ${payload.teamName}`,
    `Date: ${formatDayFull(payload.date)}`,
    `Check-in Time: ${formatTime(payload.actualCheckIn, payload.timezone)}`,
    payload.scheduledCheckIn ? `Scheduled Time: ${payload.scheduledCheckIn}` : null,
    statusLine,
    payload.note ? `Note: ${payload.note}` : null,
    `Source: ${PRODUCT_NAME}`,
  ]
    .filter(Boolean)
    .join("\n");

  return postToWebhook(webhookUrl, content);
}

export async function sendCheckOutNotification(payload: CheckOutPayload, webhookUrl: string) {
  const content = [
    `🔴 **Employee Check-Out**`,
    ``,
    `Employee: ${payload.employeeName}`,
    `Team: ${payload.teamName}`,
    `Date: ${formatDayFull(payload.date)}`,
    payload.actualCheckIn ? `Check-in: ${formatTime(payload.actualCheckIn, payload.timezone)}` : `Check-in: Missing`,
    `Check-out: ${formatTime(payload.actualCheckOut, payload.timezone)}`,
    payload.totalMinutes != null
      ? `Total Working Hours: ${formatMinutesAsHm(payload.totalMinutes)}`
      : `Total Working Hours: N/A`,
    payload.note ? `Note: ${payload.note}` : null,
    `Source: ${PRODUCT_NAME}`,
  ]
    .filter(Boolean)
    .join("\n");

  return postToWebhook(webhookUrl, content);
}

export async function sendTestNotification(kind: "checkin" | "checkout" | "team", webhookUrl: string) {
  const content = `✅ **${PRODUCT_NAME} Test Notification**\n\nThis is a test of the ${kind} channel connection.\nSource: ${PRODUCT_NAME}`;
  return postToWebhook(webhookUrl, content);
}

type KnowledgeExportPayload = {
  actorName: string;
  teamName: string;
  clientName: string | null;
  itemCount: number;
};

// Optional — silently a no-op if DISCORD_KNOWLEDGE_EXPORT_WEBHOOK_URL isn't
// set, same as every other webhook in this file. Gives admins/team leads
// visibility into who pulled a CSV containing WiFi passwords and door codes
// and when, without needing a dedicated audit-log feature.
export async function sendKnowledgeExportNotification(payload: KnowledgeExportPayload, webhookUrl: string) {
  const content = [
    `📤 **Property Knowledge Base Exported**`,
    ``,
    `By: ${payload.actorName}`,
    `Team: ${payload.teamName}`,
    `Scope: ${payload.clientName ?? "All clients"}`,
    `Properties: ${payload.itemCount}`,
    `Source: ${PRODUCT_NAME}`,
  ].join("\n");
  return postToWebhook(webhookUrl, content);
}
