// Server-side ONLY. Fans every notification out to both Discord and Slack
// in parallel — one call site per event instead of two, so adding a third
// channel later only means editing this file, not every task/attendance
// route again. Each underlying sender is already a best-effort no-op when
// its own channel isn't configured, so nothing here needs to guard on that.

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

export async function notifyCheckIn(payload: Parameters<typeof discord.sendCheckInNotification>[0]) {
  const [d, s] = await Promise.all([discord.sendCheckInNotification(payload), slack.sendCheckInNotification(payload)]);
  return { discord: d, slack: s };
}

export async function notifyCheckOut(payload: Parameters<typeof discord.sendCheckOutNotification>[0]) {
  const [d, s] = await Promise.all([discord.sendCheckOutNotification(payload), slack.sendCheckOutNotification(payload)]);
  return { discord: d, slack: s };
}

export async function notifyKnowledgeExport(payload: Parameters<typeof discord.sendKnowledgeExportNotification>[0]) {
  await Promise.all([discord.sendKnowledgeExportNotification(payload), slack.sendKnowledgeExportNotification(payload)]);
}

export async function notifyTaskCreated(task: TaskForNotify, actorName: string) {
  await Promise.all([discordBot.sendTaskCreated(task, actorName), slack.sendTaskCreated(task, actorName)]);
}

export async function notifyTaskEdited(task: TaskForNotify, actorName: string) {
  await Promise.all([discordBot.sendTaskEdited(task, actorName), slack.sendTaskEdited(task, actorName)]);
}

export async function notifyTaskDeleted(task: TaskForNotify, actorName: string) {
  await Promise.all([discordBot.sendTaskDeleted(task, actorName), slack.sendTaskDeleted(task, actorName)]);
}

export async function notifyTaskStatusChanged(
  task: TaskForNotify,
  status: "IN_PROGRESS" | "COMPLETED" | "BLOCKED",
  actorName: string
) {
  await Promise.all([discordBot.sendTaskStatusChanged(task, status, actorName), slack.sendTaskStatusChanged(task, status, actorName)]);
}

export async function notifyTasksOverdue(tasks: TaskForNotify[]) {
  await Promise.all([discordBot.sendTasksOverdue(tasks), slack.sendTasksOverdue(tasks)]);
}

export async function notifyDailyDigest(user: NotifyUser, tasks: TaskForNotify[]) {
  await Promise.all([discordBot.sendDailyDigest(user, tasks), slack.sendDailyDigest(user, tasks)]);
}
