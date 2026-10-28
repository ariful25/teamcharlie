import { prisma } from "@/lib/prisma";
import { getTeamTimezone } from "@/lib/team-timezone";
import { startOfDayUTC } from "@/lib/time";
import { releaseAt } from "@/lib/tasks/visibility";
import { inSquad, type Scope } from "@/lib/scope";

export async function getTasksPageData(scope: Scope) {
  const { teamId } = scope;
  const tz = await getTeamTimezone(teamId);
  const today = startOfDayUTC(new Date(), tz);
  const [rows, clients, employees, categories, shiftTypes] = await Promise.all([
    prisma.task.findMany({
      where: {
        ...inSquad(scope),
        deletedAt: null,
        // Templates are the recurrence rule, not a to-do item themselves —
        // they never get marked COMPLETED, so without this they'd get
        // caught by the "carried over" branch below and sit on the board
        // forever. Only the generated instances belong here.
        isRecurringTemplate: false,
        // Today's tasks (any status), plus anything from an earlier day
        // that's still not COMPLETED — incomplete work stays on the board
        // until someone actually deals with it, instead of silently
        // dropping off the moment its original day ends.
        OR: [{ date: today }, { date: { lt: today }, status: { not: "COMPLETED" } }],
      },
      include: { client: true, category: true, assignedUser: true, shiftType: true },
      orderBy: { startTime: "asc" },
    }),
    prisma.client.findMany({ where: { ...inSquad(scope), active: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { ...inSquad(scope), active: true }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ where: { teamId }, orderBy: { name: "asc" } }),
    prisma.shiftType.findMany({ where: { teamId, active: true }, orderBy: { startTime: "asc" } }),
  ]);

  // releaseAt tells the board when a shift's recurring task joins it; the
  // board itself hides "later" and long-completed tasks (lib/tasks/visibility).
  const tasks = rows.map((t) => ({ ...t, releaseAt: releaseAt(t, tz)?.toISOString() ?? null }));
  return { tasks, clients, employees, categories, shiftTypes };
}

export type TaskHistoryFilters = {
  status?: "ALL" | "COMPLETED" | "DELETED";
  clientId?: string;
  assignedUserId?: string;
  from?: string; // "yyyy-MM-dd"
  to?: string; // "yyyy-MM-dd"
};

// Everything that's left the daily board the normal way — completed or
// deleted — so a task that's "done" or "removed" stays findable by date
// instead of just being gone. Templates are excluded; they're a recurrence
// rule, not a task someone did or didn't do.
export async function getTaskHistory(scope: Scope, filters: TaskHistoryFilters = {}) {
  const statusFilter = filters.status ?? "ALL";
  const where: Record<string, unknown> = { ...inSquad(scope), isRecurringTemplate: false };

  if (statusFilter === "COMPLETED") {
    where.status = "COMPLETED";
    where.deletedAt = null;
  } else if (statusFilter === "DELETED") {
    where.deletedAt = { not: null };
  } else {
    where.OR = [{ status: "COMPLETED", deletedAt: null }, { deletedAt: { not: null } }];
  }

  if (filters.clientId) where.clientId = filters.clientId;
  if (filters.assignedUserId) where.assignedUserId = filters.assignedUserId;
  if (filters.from || filters.to) {
    where.date = {
      ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00.000Z`) } : {}),
      ...(filters.to ? { lte: new Date(`${filters.to}T00:00:00.000Z`) } : {}),
    };
  }

  return prisma.task.findMany({
    where,
    include: { client: true, category: true, assignedUser: true, shiftType: true },
    orderBy: { date: "desc" },
    take: 300,
  });
}

export type TasksPageData = Awaited<ReturnType<typeof getTasksPageData>>;
/** One task as the board receives it (Dates arrive as Dates from the server component). */
export type BoardTask = TasksPageData["tasks"][number];
