import { prisma } from "@/lib/prisma";
import { startOfDayUTC, dayOfWeekInTz, TEAM_TIMEZONE, combineDateAndTime } from "@/lib/time";
import { notifyTasksOverdue } from "@/lib/notifications";

/**
 * Recurring tasks are folded directly into the Task model (no separate Routine/
 * template entity — see Task.isRecurringTemplate / repeatMode / repeatDays). A
 * template is purely the recurrence rule; it's never itself shown as a task to
 * do (see the isRecurringTemplate: false filters throughout lib/queries/) —
 * every visible task, including the very first day, is a generated instance.
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

  // Skip templates that already have a generated instance for today —
  // matched by the real recurringTemplateId link, not a fuzzy title/client/
  // assignee guess (which breaks the moment either is edited, or collides
  // when a shift-linked template resolves to no assignee).
  const existingToday = await prisma.task.findMany({
    where: { teamId, date: today, deletedAt: null, isRecurringTemplate: false, recurringTemplateId: { not: null } },
    select: { recurringTemplateId: true },
  });
  const existingTemplateIds = new Set(existingToday.map((t) => t.recurringTemplateId));

  // A shift-linked template (t.shiftTypeId set) doesn't use its own fixed
  // assignedUserId — instead, whoever's actually scheduled WORKING that
  // shift today gets the generated instance. Resolved once per shift type,
  // not per template, since several templates can share one shift.
  const shiftTypeIds = Array.from(new Set(dueTemplates.filter((t) => t.shiftTypeId).map((t) => t.shiftTypeId!)));
  const shiftAssigneeByShiftTypeId = new Map<string, string | null>();
  if (shiftTypeIds.length > 0) {
    const assignments = await prisma.shiftAssignment.findMany({
      where: { shiftTypeId: { in: shiftTypeIds }, date: today, status: "WORKING", user: { teamId } },
      select: { shiftTypeId: true, userId: true },
    });
    const userIdsByShift = new Map<string, string[]>();
    for (const a of assignments) {
      if (!a.shiftTypeId) continue;
      userIdsByShift.set(a.shiftTypeId, [...(userIdsByShift.get(a.shiftTypeId) ?? []), a.userId]);
    }
    for (const shiftTypeId of shiftTypeIds) {
      const userIds = userIdsByShift.get(shiftTypeId) ?? [];
      // Exactly one person scheduled WORKING that shift today -> assign to
      // them. Nobody scheduled, or more than one (shared shift) -> leave
      // unassigned rather than guess; the team picks it up from the board.
      shiftAssigneeByShiftTypeId.set(shiftTypeId, userIds.length === 1 ? userIds[0] : null);
    }
  }
  const resolveAssignee = (t: (typeof dueTemplates)[number]) =>
    t.shiftTypeId ? shiftAssigneeByShiftTypeId.get(t.shiftTypeId) ?? null : t.assignedUserId;

  // No date check here — a template's own `date` is just when it was
  // created, not "already generated today." Every due template gets a real
  // instance today, including the day it was created, unless one already
  // exists (the dedup check above).
  const toCreate = dueTemplates.filter((t) => !existingTemplateIds.has(t.id));

  if (toCreate.length === 0) return { created: 0 };

  // createMany + skipDuplicates (backed by the @@unique([recurringTemplateId,
  // date]) constraint on Task) rather than a $transaction of individual
  // creates — the dashboard's generation throttle is check-then-act, not
  // atomic, so two near-simultaneous requests can both pass the dedup check
  // above before either's rows commit. skipDuplicates makes that race land
  // on "only one instance survives" instead of a duplicated day's checklist.
  const result = await prisma.task.createMany({
    data: toCreate.map((t) => ({
      clientId: t.clientId,
      propertyName: t.propertyName,
      categoryId: t.categoryId,
      assignedUserId: resolveAssignee(t),
      shiftTypeId: t.shiftTypeId,
      recurringTemplateId: t.id,
      title: t.title,
      description: t.description,
      notes: t.notes,
      date: today,
      startTime: t.startTime,
      dueTime: t.dueTime,
      priority: t.priority,
      status: "UPCOMING",
      teamId,
      isRecurringTemplate: false,
    })),
    skipDuplicates: true,
  });

  return { created: result.count };
}

/**
 * Marks any UPCOMING/IN_PROGRESS task whose dueTime has passed as OVERDUE —
 * not just today's. A task that was never dealt with keeps getting swept up
 * by this on every later day too (it stays UPCOMING/IN_PROGRESS until
 * someone actually completes it), by design: incomplete work should stay
 * visible and overdue forever rather than quietly stop being checked once
 * its original day ends. Safe & idempotent — call on dashboard load or via
 * a scheduled job.
 */
export async function refreshOverdueTasks(teamId: string, referenceDate: Date = new Date()) {
  const today = startOfDayUTC(referenceDate);

  const candidates = await prisma.task.findMany({
    where: {
      teamId,
      date: { lte: today },
      status: { in: ["UPCOMING", "IN_PROGRESS"] },
      dueTime: { not: null },
      deletedAt: null,
      // A template is the recurrence rule, not a to-do item — it never gets
      // completed, so leaving it in here would flip it to OVERDUE forever.
      isRecurringTemplate: false,
    },
    include: { client: true, assignedUser: true },
  });

  const newlyOverdue: typeof candidates = [];
  for (const t of candidates) {
    if (!t.dueTime) continue;
    // Each task's own date, not the reference day — a task from three days
    // ago is compared against its own due time on its own day, not today's.
    const due = combineDateAndTime(t.date, t.dueTime);
    if (due.getTime() < referenceDate.getTime()) {
      newlyOverdue.push(t);
    }
  }

  if (newlyOverdue.length > 0) {
    await prisma.task.updateMany({
      where: { id: { in: newlyOverdue.map((t) => t.id) } },
      data: { status: "OVERDUE" },
    });
    // Best-effort — this sweep runs off a throttled background job, not a
    // user action, so there's no "actor" to attribute and no request to
    // fail if Discord is unreachable.
    await notifyTasksOverdue(newlyOverdue);
  }

  return { markedOverdue: newlyOverdue.length };
}
