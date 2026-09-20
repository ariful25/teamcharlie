import { prisma } from "@/lib/prisma";
import { startOfDayUTC, formatTime, combineDateAndTime } from "@/lib/time";
import { differenceInMinutes } from "date-fns";

export async function getDashboardData(teamId: string) {
  const today = startOfDayUTC(new Date());

  const [tasks, clients, issues, attendanceRecords, employees] = await Promise.all([
    prisma.task.findMany({
      where: { teamId, date: today, deletedAt: null },
      include: { client: true, category: true, assignedUser: true },
      orderBy: { startTime: "asc" },
    }),
    prisma.client.findMany({ where: { teamId, active: true }, orderBy: { name: "asc" } }),
    prisma.issue.findMany({ where: { teamId, status: { not: "RESOLVED" } } }),
    prisma.attendanceRecord.findMany({ where: { date: today }, include: { user: true } }),
    prisma.user.findMany({ where: { teamId, active: true } }),
  ]);

  const completed = tasks.filter((t) => t.status === "COMPLETED").length;
  const pending = tasks.filter((t) => t.status === "UPCOMING" || t.status === "IN_PROGRESS").length;
  const overdue = tasks.filter((t) => t.status === "OVERDUE").length;
  const urgentIssues = issues.filter((i) => i.severity === "HIGH" || i.severity === "CRITICAL").length;
  const followUpTasks = tasks.filter((t) => t.category?.name === "Follow-up").length;

  const checkedInCount = attendanceRecords.filter((r) => r.actualCheckIn).length;

  const clientStats = clients.map((c) => {
    const clientTasks = tasks.filter((t) => t.clientId === c.id);
    const clientIssues = issues.filter((i) => i.clientId === c.id);
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      completedTasks: clientTasks.filter((t) => t.status === "COMPLETED").length,
      totalTasks: clientTasks.length,
      openIssues: clientIssues.length,
      followUps: clientTasks.filter((t) => t.category?.name === "Follow-up").length,
    };
  });

  const operationRows = tasks.map((t) => {
    let overdueBy: string | null = null;
    if (t.status === "OVERDUE" && t.dueTime) {
      const due = combineDateAndTime(today, t.dueTime);
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
      urgentIssues,
      followUpTasks,
      employeesCheckedIn: checkedInCount,
      totalEmployees: employees.length,
    },
    clientStats,
    operationRows,
    attendanceRows,
  };
}
