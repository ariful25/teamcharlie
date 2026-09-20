import { prisma } from "@/lib/prisma";
import { startOfDayUTC, dayOfWeekInTz, TEAM_TIMEZONE, combineDateAndTime } from "@/lib/time";

/**
 * Recurring tasks are folded directly into the Task model (no separate Routine/
 * template entity — see Task.isRecurringTemplate / repeatMode / repeatDays).
 *
 * This generates today's Task instances from every task marked as a recurring
 * template whose repeat schedule includes today. Idempotent: safe to call multiple
 * times a day (e.g. from a cron / on-dashboard-load) because it skips templates that
 * already have a same-day instance.
 *
 * Editing a generated instance never mutates the template it came from, and editing
 * the template only affects instances generated after the edit — same guarantee the
 * old Routine system had, just with one entity instead of two.
 */
export async function generateRecurringTaskInstances(teamId: string, referenceDate: Date = new Date()) {
  const today = startOfDayUTC(referenceDate);
  const dow = dayOfWeekInTz(referenceDate, TEAM_TIMEZONE);

  const templates = await prisma.task.findMany({
    where: { teamId, isRecurringTemplate: true, deletedAt: null },
  });

  const dueTemplates = templates.filter((t) => {
    if (t.repeatMode === "DAILY") return true;
    if (t.repeatMode === "WEEKLY" || t.repeatMode === "CUSTOM") {
      return t.repeatDays.includes(dow);
    }
    return false; // NONE — shouldn't happen for a template, but guard anyway
  });

  if (dueTemplates.length === 0) return { created: 0 };

  // Skip templates whose own row already falls on today (freshly created today) or
  // that already have a generated instance for today (title/client/assignee match).
  const existingToday = await prisma.task.findMany({
    where: { teamId, date: today, deletedAt: null },
    select: { title: true, clientId: true, assignedUserId: true },
  });
  const existingKey = (t: { title: string; clientId: string | null; assignedUserId: string | null }) =>
    `${t.title}::${t.clientId ?? ""}::${t.assignedUserId ?? ""}`;
  const existingKeys = new Set(existingToday.map(existingKey));

  const toCreate = dueTemplates.filter((t) => {
    if (t.date.getTime() === today.getTime()) return false; // the template row itself is today's instance
    return !existingKeys.has(existingKey(t));
  });

  if (toCreate.length === 0) return { created: 0 };

  await prisma.$transaction(
    toCreate.map((t) =>
      prisma.task.create({
        data: {
          clientId: t.clientId,
          propertyName: t.propertyName,
          categoryId: t.categoryId,
          assignedUserId: t.assignedUserId,
          title: t.title,
          description: t.description,
          date: today,
          startTime: t.startTime,
          dueTime: t.dueTime,
          priority: t.priority,
          status: "UPCOMING",
          teamId,
          isRecurringTemplate: false,
        },
      })
    )
  );

  return { created: toCreate.length };
}

/**
 * Marks any UPCOMING/IN_PROGRESS task whose dueTime has passed today as OVERDUE.
 * Safe & idempotent — call on dashboard load or via a scheduled job.
 */
export async function refreshOverdueTasks(teamId: string, referenceDate: Date = new Date()) {
  const today = startOfDayUTC(referenceDate);

  const candidates = await prisma.task.findMany({
    where: {
      teamId,
      date: today,
      status: { in: ["UPCOMING", "IN_PROGRESS"] },
      dueTime: { not: null },
      deletedAt: null,
    },
  });

  const overdueIds: string[] = [];
  for (const t of candidates) {
    if (!t.dueTime) continue;
    const due = combineDateAndTime(today, t.dueTime);
    if (due.getTime() < referenceDate.getTime()) {
      overdueIds.push(t.id);
    }
  }

  if (overdueIds.length > 0) {
    await prisma.task.updateMany({
      where: { id: { in: overdueIds } },
      data: { status: "OVERDUE" },
    });
  }

  return { markedOverdue: overdueIds.length };
}
