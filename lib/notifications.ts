// Server-side ONLY. Fans every notification out to the channels configured
// for the event's own team — one call site per event, so adding a channel
// later only means editing this file.
//
// Routing (multi-team):
// - The home team (HOME_TEAM_SLUG, lib/brand.ts) keeps the deployment's
//   env-configured Discord webhooks, Discord bot and Slack app.
// - Every other team only ever posts to the single Discord webhook it saved
//   in its own Settings (TeamSettings.discordWebhookUrl), or nowhere. Before
//   this, every team's events went to the env channels — i.e. one company's
//   task and attendance activity would have landed in another's Discord.
//
// Each sender is a best-effort no-op ({ ok: false }) when its channel isn't
// configured, so call sites never need to guard on that.

import { prisma } from "@/lib/prisma";
import { HOME_TEAM_SLUG } from "@/lib/brand";
import * as discord from "@/lib/discord";
import * as discordBot from "@/lib/discord-bot";
import * as slack from "@/lib/slack-bot";

type DiscordUser = { name: string; discordUserId?: string | null };
type SlackUser = { name: string; slackUserId?: string | null };
type NotifyUser = DiscordUser & SlackUser;

type TaskForNotify = {
  id: string;
  title: string;
  priority: string;
  status?: string;
  dueTime?: string | null;
  propertyName?: string | null;
  client?: { name: string } | null;
  assignedUser?: NotifyUser | null;
};

type Result = { ok: boolean; error?: string };

const NOT_CONFIGURED: Result = { ok: false, error: "Not configured for this team" };

export type TeamChannels = { isHomeTeam: boolean; webhookUrl: string | null };

export async function getTeamChannels(teamId: string): Promise<TeamChannels> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { slug: true, settings: { select: { discordWebhookUrl: true } } },
  });
  return {
    isHomeTeam: team?.slug === HOME_TEAM_SLUG,
    webhookUrl: team?.settings?.discordWebhookUrl || null,
  };
}

/** Discord webhook for an attendance/export event: the env URL for the home
 *  team, the team's own webhook otherwise. */
function attendanceWebhook(channels: TeamChannels, envUrl: string | undefined) {
  if (channels.isHomeTeam) return envUrl || channels.webhookUrl || "";
  return channels.webhookUrl || "";
}

/** Where task-channel messages go: the bot (no target) for the home team, the
 *  team's webhook for anyone else, or null to skip Discord entirely. */
function taskTarget(channels: TeamChannels): discordBot.TaskTarget | null {
  if (channels.isHomeTeam) return {};
  return channels.webhookUrl ? { webhookUrl: channels.webhookUrl } : null;
}

type CheckInPayload = Parameters<typeof discord.sendCheckInNotification>[0];
type CheckOutPayload = Parameters<typeof discord.sendCheckOutNotification>[0];

export async function sendCheckInVia(channel: "discord" | "slack", teamId: string, payload: CheckInPayload): Promise<Result> {
  const channels = await getTeamChannels(teamId);
  if (channel === "slack") return channels.isHomeTeam ? slack.sendCheckInNotification(payload) : NOT_CONFIGURED;
  return discord.sendCheckInNotification(payload, attendanceWebhook(channels, process.env.DISCORD_CHECKIN_WEBHOOK_URL));
}

export async function sendCheckOutVia(channel: "discord" | "slack", teamId: string, payload: CheckOutPayload): Promise<Result> {
  const channels = await getTeamChannels(teamId);
  if (channel === "slack") return channels.isHomeTeam ? slack.sendCheckOutNotification(payload) : NOT_CONFIGURED;
  return discord.sendCheckOutNotification(payload, attendanceWebhook(channels, process.env.DISCORD_CHECKOUT_WEBHOOK_URL));
}

export async function notifyCheckIn(teamId: string, payload: CheckInPayload) {
  const [d, s] = await Promise.all([sendCheckInVia("discord", teamId, payload), sendCheckInVia("slack", teamId, payload)]);
  return { discord: d, slack: s };
}

export async function notifyCheckOut(teamId: string, payload: CheckOutPayload) {
  const [d, s] = await Promise.all([sendCheckOutVia("discord", teamId, payload), sendCheckOutVia("slack", teamId, payload)]);
  return { discord: d, slack: s };
}

export async function notifyKnowledgeExport(teamId: string, payload: Parameters<typeof discord.sendKnowledgeExportNotification>[0]) {
  const channels = await getTeamChannels(teamId);
  await Promise.all([
    discord.sendKnowledgeExportNotification(payload, attendanceWebhook(channels, process.env.DISCORD_KNOWLEDGE_EXPORT_WEBHOOK_URL)),
    channels.isHomeTeam ? slack.sendKnowledgeExportNotification(payload) : null,
  ]);
}

// Shared shape of every task event: Discord (bot or team webhook) + Slack
// (home team only).
async function fanOutTask(
  teamId: string,
  toDiscord: (target: discordBot.TaskTarget) => Promise<unknown>,
  toSlack: () => Promise<unknown>
) {
  const channels = await getTeamChannels(teamId);
  const target = taskTarget(channels);
  await Promise.all([target ? toDiscord(target) : null, channels.isHomeTeam ? toSlack() : null]);
}

export async function notifyTaskCreated(teamId: string, task: TaskForNotify, actorName: string) {
  await fanOutTask(
    teamId,
    (t) => discordBot.sendTaskCreated(task, actorName, t),
    () => slack.sendTaskCreated(task, actorName)
  );
}

export async function notifyTaskEdited(teamId: string, task: TaskForNotify, actorName: string) {
  await fanOutTask(
    teamId,
    (t) => discordBot.sendTaskEdited(task, actorName, t),
    () => slack.sendTaskEdited(task, actorName)
  );
}

export async function notifyTaskDeleted(teamId: string, task: TaskForNotify, actorName: string) {
  await fanOutTask(
    teamId,
    (t) => discordBot.sendTaskDeleted(task, actorName, t),
    () => slack.sendTaskDeleted(task, actorName)
  );
}

export async function notifyTaskStatusChanged(
  teamId: string,
  task: TaskForNotify,
  status: "IN_PROGRESS" | "COMPLETED" | "BLOCKED",
  actorName: string
) {
  await fanOutTask(
    teamId,
    (t) => discordBot.sendTaskStatusChanged(task, status, actorName, t),
    () => slack.sendTaskStatusChanged(task, status, actorName)
  );
}

export async function notifyTasksOverdue(teamId: string, tasks: TaskForNotify[]) {
  await fanOutTask(
    teamId,
    (t) => discordBot.sendTasksOverdue(tasks, t),
    () => slack.sendTasksOverdue(tasks)
  );
}

/** Listing Health weekly-check alerts (rating drops, listings gone offline). */
export async function notifyListingAlerts(teamId: string, lines: string[]) {
  if (lines.length === 0) return;
  const text = [`📉 Listing Health — ${lines.length} listing${lines.length === 1 ? "" : "s"} need attention`, "", ...lines.map((l) => `• ${l}`)].join("\n");
  await fanOutTask(
    teamId,
    (t) => discordBot.sendTaskChannelText(text, t),
    () => slack.sendTaskChannelText(text)
  );
}

export async function notifyDailyDigest(teamId: string, user: NotifyUser, tasks: TaskForNotify[]) {
  await fanOutTask(
    teamId,
    (t) => discordBot.sendDailyDigest(user, tasks, t),
    () => slack.sendDailyDigest(user, tasks)
  );
}
