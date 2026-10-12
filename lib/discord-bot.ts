// Server-side ONLY. Never import this from a client component.
//
// Unlike lib/discord.ts (plain incoming-webhook POSTs, used for
// attendance/knowledge-export notifications), this talks to Discord's bot
// REST API directly — needed because the daily digest has clickable button
// components, which a webhook can't render or receive clicks for. See
// app/api/discord/interactions/route.ts for the click-handling side.
//
// Every function here is a best-effort no-op (returns {ok:false}, never
// throws) when DISCORD_BOT_TOKEN or DISCORD_TASK_CHANNEL_ID isn't set yet,
// so task routes can call these unconditionally without needing to guard
// every call site on whether the bot has been configured.

const DISCORD_API = "https://discord.com/api/v10";

type DiscordResult = { ok: boolean; error?: string; messageId?: string };

function botConfigured() {
  return !!process.env.DISCORD_BOT_TOKEN && !!process.env.DISCORD_TASK_CHANNEL_ID;
}

async function discordRequest(path: string, init: RequestInit): Promise<{ ok: boolean; error?: string; body?: any }> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return { ok: false, error: "DISCORD_BOT_TOKEN not configured" };
  try {
    const res = await fetch(`${DISCORD_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) {
      return { ok: false, error: `Discord returned ${res.status}: ${JSON.stringify(body).slice(0, 300)}` };
    }
    return { ok: true, body };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Unknown network error" };
  }
}

async function postToTaskChannel(payload: Record<string, unknown>): Promise<DiscordResult> {
  const channelId = process.env.DISCORD_TASK_CHANNEL_ID;
  if (!channelId) return { ok: false, error: "DISCORD_TASK_CHANNEL_ID not configured" };
  const result = await discordRequest(`/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return { ok: result.ok, error: result.error, messageId: result.body?.id };
}

// `<@id>` pings; falls back to a plain (non-pinging) name when the employee
// has no Discord ID saved yet in Settings > Users.
export function mentionFor(user: { name: string; discordUserId?: string | null }) {
  return user.discordUserId ? `<@${user.discordUserId}>` : user.name;
}

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
  assignedUser?: { name: string; discordUserId?: string | null } | null;
};

export async function sendTaskCreated(task: TaskForMessage, actorName: string) {
  const content = [
    `🆕 **Task Created**`,
    ``,
    `${PRIORITY_EMOJI[task.priority] ?? ""} ${taskLine(task)}`,
    `Assigned: ${task.assignedUser ? mentionFor(task.assignedUser) : "Unassigned"}`,
    `By: ${actorName}`,
  ].join("\n");
  return postToTaskChannel({ content });
}

export async function sendTaskEdited(task: TaskForMessage, actorName: string) {
  const content = [`✏️ **Task Updated**`, ``, `${PRIORITY_EMOJI[task.priority] ?? ""} ${taskLine(task)}`, `By: ${actorName}`].join(
    "\n"
  );
  return postToTaskChannel({ content });
}

export async function sendTaskDeleted(task: TaskForMessage, actorName: string) {
  const content = [`🗑️ **Task Deleted**`, ``, `${taskLine(task)}`, `By: ${actorName}`].join("\n");
  return postToTaskChannel({ content });
}

export async function sendTaskStatusChanged(task: TaskForMessage, status: "IN_PROGRESS" | "COMPLETED" | "BLOCKED", actorName: string) {
  const headers: Record<string, string> = {
    IN_PROGRESS: "🔵 **Task In Progress**",
    COMPLETED: "✅ **Task Completed**",
    BLOCKED: "⛔ **Task Blocked**",
  };
  const content = [headers[status], ``, `${taskLine(task)}`, `By: ${actorName}`].join("\n");
  return postToTaskChannel({ content });
}

// Batched into one message (not one per task) since this runs off the
// throttled overdue sweep and could otherwise fire a burst of messages.
export async function sendTasksOverdue(tasks: TaskForMessage[]) {
  if (tasks.length === 0) return { ok: true } as DiscordResult;
  const content = [
    `⏰ **${tasks.length} Task${tasks.length > 1 ? "s" : ""} Overdue**`,
    ``,
    ...tasks.map((t) => `• ${taskLine(t)} — ${t.assignedUser ? mentionFor(t.assignedUser) : "Unassigned"}`),
  ].join("\n");
  return postToTaskChannel({ content });
}

const COMPLETE_BUTTON_PREFIX = "complete_task:";

function digestComponents(tasks: TaskForMessage[]) {
  // Discord allows 5 buttons per action row and 5 rows per message (25
  // buttons max). The daily list is realistically well under that for one
  // employee; if it ever isn't, later tasks just render without a button
  // rather than the message failing to send. Already-completed tasks get
  // no button — nothing left to click — so the row count shrinks as the
  // day's tasks get checked off.
  const buttonable = tasks.filter((t) => t.status !== "COMPLETED").slice(0, 25);
  const rows = [];
  for (let i = 0; i < buttonable.length; i += 5) {
    rows.push({
      type: 1,
      components: buttonable.slice(i, i + 5).map((t) => ({
        type: 2,
        style: 3,
        label: t.title.length > 70 ? `${t.title.slice(0, 67)}...` : t.title,
        custom_id: `${COMPLETE_BUTTON_PREFIX}${t.id}`,
        emoji: { name: "✅" },
      })),
    });
  }
  return rows;
}

export function buildDailyDigestContent(user: { name: string; discordUserId?: string | null }, tasks: TaskForMessage[]) {
  if (tasks.length === 0) {
    return `👋 Good morning ${mentionFor(user)} — no tasks assigned for today.`;
  }
  const remaining = tasks.filter((t) => t.status !== "COMPLETED").length;
  const lines = tasks.map((t, i) =>
    t.status === "COMPLETED" ? `${i + 1}. ✅ ~~${taskLine(t)}~~` : `${i + 1}. ${PRIORITY_EMOJI[t.priority] ?? ""} ${taskLine(t)}`
  );
  return [
    `👋 Good morning ${mentionFor(user)} — here's today's tasks:`,
    ``,
    ...lines,
    ``,
    remaining > 0
      ? `Tap a button below to mark that task complete once it's done.`
      : `All done for today 🎉`,
  ].join("\n");
}

export async function sendDailyDigest(user: { name: string; discordUserId?: string | null }, tasks: TaskForMessage[]) {
  return postToTaskChannel({
    content: buildDailyDigestContent(user, tasks),
    components: tasks.length > 0 ? digestComponents(tasks) : undefined,
  });
}

// Shared by the daily digest and by the interactions endpoint re-rendering
// the message after a button click — see app/api/discord/interactions.
export function isCompleteTaskCustomId(customId: string) {
  return customId.startsWith(COMPLETE_BUTTON_PREFIX);
}

export function taskIdFromCustomId(customId: string) {
  return customId.slice(COMPLETE_BUTTON_PREFIX.length);
}

export { botConfigured, digestComponents };
