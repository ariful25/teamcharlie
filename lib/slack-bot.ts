// Server-side ONLY. Never import this from a client component.
//
// Unlike Discord (lib/discord.ts's plain webhooks for attendance/knowledge-
// export, lib/discord-bot.ts's real bot for tasks/digest), Slack gets ONE
// bot for everything here — a Slack bot token can post to any channel it's
// invited to, so there's no separate "simple webhook" tier the way Discord
// has. Needed either way, since the daily digest's buttons require Slack's
// Block Kit + an interactivity endpoint (see app/api/slack/interactions),
// which a plain incoming webhook can't receive clicks for.
//
// Every function here is a best-effort no-op (returns {ok:false}, never
// throws) when SLACK_BOT_TOKEN isn't set yet, so call sites don't need to
// guard on whether Slack has been configured.

import { formatTime, formatDateLong, formatMinutesAsHm } from "@/lib/time";

const SLACK_API = "https://slack.com/api";

type SlackResult = { ok: boolean; error?: string };

function channelFor(specific: string | undefined) {
  return specific || process.env.SLACK_TASK_CHANNEL_ID || "";
}

async function slackRequest(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; body?: any }> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return { ok: false, error: "SLACK_BOT_TOKEN not configured" };
  try {
    const res = await fetch(`${SLACK_API}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    // Slack returns HTTP 200 even for API-level failures — the real
    // success signal is the `ok` field in the body, not the status code.
    if (!json.ok) return { ok: false, error: json.error ?? "Unknown Slack API error" };
    return { ok: true, body: json };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Unknown network error" };
  }
}

async function postMessage(channel: string, text: string, blocks?: unknown[]): Promise<SlackResult> {
  if (!channel) return { ok: false, error: "No Slack channel configured" };
  const result = await slackRequest("/chat.postMessage", { channel, text, blocks });
  return { ok: result.ok, error: result.error };
}

export function mentionFor(user: { name: string; slackUserId?: string | null }) {
  return user.slackUserId ? `<@${user.slackUserId}>` : user.name;
}

// ---- Attendance (parallels lib/discord.ts) ----

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

export async function sendCheckInNotification(payload: CheckInPayload) {
  const emoji = payload.isLate ? "🟡" : "🟢";
  const statusLine = payload.isLate ? `Status: Late by ${payload.lateMinutes} minutes` : "Status: On Time";
  const text = [
    `${emoji} *Employee Check-In*`,
    `Employee: ${payload.employeeName}`,
    `Team: ${payload.teamName}`,
    `Date: ${formatDateLong(payload.date)}`,
    `Check-in Time: ${formatTime(payload.actualCheckIn)}`,
    payload.scheduledCheckIn ? `Scheduled Time: ${payload.scheduledCheckIn}` : null,
    statusLine,
  ]
    .filter(Boolean)
    .join("\n");
  return postMessage(channelFor(process.env.SLACK_CHECKIN_CHANNEL_ID), text);
}

export async function sendCheckOutNotification(payload: CheckOutPayload) {
  const text = [
    `🔴 *Employee Check-Out*`,
    `Employee: ${payload.employeeName}`,
    `Team: ${payload.teamName}`,
    `Date: ${formatDateLong(payload.date)}`,
    payload.actualCheckIn ? `Check-in: ${formatTime(payload.actualCheckIn)}` : `Check-in: Missing`,
    `Check-out: ${formatTime(payload.actualCheckOut)}`,
    payload.totalMinutes != null ? `Total Working Hours: ${formatMinutesAsHm(payload.totalMinutes)}` : `Total Working Hours: N/A`,
  ].join("\n");
  return postMessage(channelFor(process.env.SLACK_CHECKOUT_CHANNEL_ID), text);
}

type KnowledgeExportPayload = {
  actorName: string;
  teamName: string;
  clientName: string | null;
  itemCount: number;
};

export async function sendKnowledgeExportNotification(payload: KnowledgeExportPayload) {
  const text = [
    `📤 *Property Knowledge Base Exported*`,
    `By: ${payload.actorName}`,
    `Team: ${payload.teamName}`,
    `Scope: ${payload.clientName ?? "All clients"}`,
    `Properties: ${payload.itemCount}`,
  ].join("\n");
  return postMessage(channelFor(process.env.SLACK_KNOWLEDGE_EXPORT_CHANNEL_ID), text);
}

export async function sendTestNotification(kind: "checkin" | "checkout") {
  const channel = kind === "checkin" ? channelFor(process.env.SLACK_CHECKIN_CHANNEL_ID) : channelFor(process.env.SLACK_CHECKOUT_CHANNEL_ID);
  return postMessage(channel, `✅ *Charlie HQ Test Notification*\nThis is a test of the ${kind} channel connection.`);
}

// ---- Task activity + daily digest (parallels lib/discord-bot.ts) ----

function taskLine(task: {
  title: string;
  client?: { name: string } | null;
  propertyName?: string | null;
  dueTime?: string | null;
  priority: string;
}) {
  const where = [task.client?.name, task.propertyName].filter(Boolean).join(" · ");
  const parts = [task.title, where ? `(${where})` : null, task.dueTime ? `due ${task.dueTime}` : null];
  return parts.filter(Boolean).join(" ");
}

const PRIORITY_EMOJI: Record<string, string> = { URGENT: "🔴", IMPORTANT: "🟡", NORMAL: "⚪" };

type TaskForMessage = {
  id: string;
  title: string;
  priority: string;
  status?: string;
  dueTime?: string | null;
  propertyName?: string | null;
  client?: { name: string } | null;
  assignedUser?: { name: string; slackUserId?: string | null } | null;
};

export async function sendTaskCreated(task: TaskForMessage, actorName: string) {
  const text = [
    `🆕 *Task Created*`,
    `${PRIORITY_EMOJI[task.priority] ?? ""} ${taskLine(task)}`,
    `Assigned: ${task.assignedUser ? mentionFor(task.assignedUser) : "Unassigned"}`,
    `By: ${actorName}`,
  ].join("\n");
  return postMessage(channelFor(undefined), text);
}

export async function sendTaskEdited(task: TaskForMessage, actorName: string) {
  const text = [`✏️ *Task Updated*`, `${PRIORITY_EMOJI[task.priority] ?? ""} ${taskLine(task)}`, `By: ${actorName}`].join("\n");
  return postMessage(channelFor(undefined), text);
}

export async function sendTaskDeleted(task: TaskForMessage, actorName: string) {
  const text = [`🗑️ *Task Deleted*`, `${taskLine(task)}`, `By: ${actorName}`].join("\n");
  return postMessage(channelFor(undefined), text);
}

export async function sendTaskStatusChanged(task: TaskForMessage, status: "IN_PROGRESS" | "COMPLETED" | "BLOCKED", actorName: string) {
  const headers: Record<string, string> = {
    IN_PROGRESS: "🔵 *Task In Progress*",
    COMPLETED: "✅ *Task Completed*",
    BLOCKED: "⛔ *Task Blocked*",
  };
  const text = [headers[status], `${taskLine(task)}`, `By: ${actorName}`].join("\n");
  return postMessage(channelFor(undefined), text);
}

export async function sendTasksOverdue(tasks: TaskForMessage[]) {
  if (tasks.length === 0) return { ok: true } as SlackResult;
  const text = [
    `⏰ *${tasks.length} Task${tasks.length > 1 ? "s" : ""} Overdue*`,
    ...tasks.map((t) => `• ${taskLine(t)} — ${t.assignedUser ? mentionFor(t.assignedUser) : "Unassigned"}`),
  ].join("\n");
  return postMessage(channelFor(undefined), text);
}

const COMPLETE_ACTION_ID = "complete_task";

function digestBlocks(tasks: TaskForMessage[]) {
  // Slack allows up to 25 elements per "actions" block — chunked at 5 to
  // keep each row's buttons readable, mirroring the Discord digest's
  // layout rather than because Slack requires it.
  const buttonable = tasks.filter((t) => t.status !== "COMPLETED").slice(0, 25);
  const blocks: unknown[] = [];
  for (let i = 0; i < buttonable.length; i += 5) {
    blocks.push({
      type: "actions",
      elements: buttonable.slice(i, i + 5).map((t) => ({
        type: "button",
        text: { type: "plain_text", text: t.title.length > 70 ? `${t.title.slice(0, 67)}...` : t.title, emoji: true },
        action_id: COMPLETE_ACTION_ID,
        value: t.id,
      })),
    });
  }
  return blocks;
}

export function buildDailyDigestText(user: { name: string; slackUserId?: string | null }, tasks: TaskForMessage[]) {
  if (tasks.length === 0) {
    return `👋 Good morning ${mentionFor(user)} — no tasks assigned for today.`;
  }
  const remaining = tasks.filter((t) => t.status !== "COMPLETED").length;
  const lines = tasks.map((t, i) =>
    t.status === "COMPLETED" ? `${i + 1}. ✅ ~${taskLine(t)}~` : `${i + 1}. ${PRIORITY_EMOJI[t.priority] ?? ""} ${taskLine(t)}`
  );
  return [
    `👋 Good morning ${mentionFor(user)} — here's today's tasks:`,
    ...lines,
    remaining > 0 ? `Tap a button below to mark that task complete once it's done.` : `All done for today 🎉`,
  ].join("\n");
}

export async function sendDailyDigest(user: { name: string; slackUserId?: string | null }, tasks: TaskForMessage[]) {
  const channel = channelFor(undefined);
  const text = buildDailyDigestText(user, tasks);
  if (tasks.length === 0) return postMessage(channel, text);
  return postMessage(channel, text, [{ type: "section", text: { type: "mrkdwn", text } }, ...digestBlocks(tasks)]);
}

export function isCompleteTaskAction(actionId: string) {
  return actionId === COMPLETE_ACTION_ID;
}

export { digestBlocks };
