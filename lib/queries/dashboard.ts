import { prisma } from "@/lib/prisma";
import { startOfDayUTC, formatTime, combineDateAndTime } from "@/lib/time";
import { differenceInMinutes } from "date-fns";

export async function getDashboardData(teamId: string) {
  const today = startOfDayUTC(new Date());

  const [allTasks, clients, attendanceRecords, employees] = await Promise.all([
    prisma.task.findMany({
      where: {
        teamId,
        deletedAt: null,
        // Templates are the recurrence rule, not a to-do item themselves —
        // excluded so they don't get caught by the "carried over" branch
        // and sit on the dashboard forever (they never reach COMPLETED).
        isRecurringTemplate: false,
        // Today's tasks, plus anything incomplete from an earlier day that's
        // still hanging around overdue — see refreshOverdueTasks. Split back
        // into `tasks` (today only) below so "Today's Tasks" etc. keep their
        // existing meaning; only the Overdue stat and the operations table
        // need the carried-over ones.
        OR: [{ date: today }, { date: { lt: today }, status: { not: "COMPLETED" } }],
      },
      include: { client: true, category: true, assignedUser: true, shiftType: true },
      orderBy: { startTime: "asc" },
    }),
    prisma.client.findMany({ where: { teamId, active: true }, orderBy: { name: "asc" } }),
    prisma.attendanceRecord.findMany({ where: { date: today }, include: { user: true } }),
    prisma.user.findMany({ where: { teamId, active: true } }),
  ]);

  const tasks = allTasks.filter((t) => t.date.getTime() === today.getTime());

  const completed = tasks.filter((t) => t.status === "COMPLETED").length;
  const pending = tasks.filter((t) => t.status === "UPCOMING" || t.status === "IN_PROGRESS").length;
  // Full set, not just today's — a task overdue since three days ago should
  // still count here instead of disappearing once its original day passes.
  const overdue = allTasks.filter((t) => t.status === "OVERDUE").length;
  const followUpTasks = tasks.filter((t) => t.category?.name === "Follow-up").length;

  const checkedInCount = attendanceRecords.filter((r) => r.actualCheckIn).length;

  const clientStats = clients.map((c) => {
    const clientTasks = tasks.filter((t) => t.clientId === c.id);
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      completedTasks: clientTasks.filter((t) => t.status === "COMPLETED").length,
      totalTasks: clientTasks.length,
      followUps: clientTasks.filter((t) => t.category?.name === "Follow-up").length,
    };
  });

  // Full set, not just today's — a carried-over overdue task needs to show
  // up here too, or it'd be marked OVERDUE but invisible on the dashboard.
  const operationRows = allTasks.map((t) => {
    let overdueBy: string | null = null;
    if (t.status === "OVERDUE" && t.dueTime) {
      // t's own date, not today's — a task overdue since 3 days ago must be
      // compared against when it was actually due, not today's date, or
      // "overdue by" would understate it (or go negative).
      const due = combineDateAndTime(t.date, t.dueTime);
      const mins = differenceInMinutes(new Date(), due);
      overdueBy = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} minutes`;
    }
    return {
      id: t.id,
      time: t.startTime,
      title: t.title,
      clientName: t.client?.name ?? null,
      category: t.category?.name ?? null,
      assignedTo: t.assignedUser?.name ?? null,
      priority: t.priority,
      status: t.status,
      dueTime: t.dueTime,
      overdueBy,
    };
  });

  const attendanceRows = employees.map((emp) => {
    const record = attendanceRecords.find((r) => r.userId === emp.id);
    if (!record?.actualCheckIn) {
      return { userId: emp.id, name: emp.name, status: "not_checked_in" as const, time: null };
    }
    return {
      userId: emp.id,
      name: emp.name,
      status: record.status === "LATE" ? ("late" as const) : ("checked_in" as const),
      time: formatTime(record.actualCheckIn),
    };
  });

  return {
    stats: {
      todaysTasks: tasks.length,
      completed,
      pending,
      overdue,
      followUpTasks,
      employeesCheckedIn: checkedInCount,
      totalEmployees: employees.length,
    },
    clientStats,
    operationRows,
    attendanceRows,
  };
}
