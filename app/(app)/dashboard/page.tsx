import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { generateRecurringTaskInstances, refreshOverdueTasks } from "@/lib/services/task-generation";
import { flagMissingCheckouts } from "@/lib/services/attendance";
import { getDashboardData } from "@/lib/queries/dashboard";
import { formatDateLong, formatTime, greeting } from "@/lib/time";
import { StatCard } from "@/components/dashboard/stat-card";
import { ClientStatusCard } from "@/components/dashboard/client-status-card";
import { TodaysOperations } from "@/components/dashboard/todays-operations";
import { ShiftCard } from "@/components/dashboard/shift-card";
import { AttendanceWidget } from "@/components/dashboard/attendance-widget";
import { CharlieHq3DWrapper } from "@/components/dashboard/charlie-hq-3d-wrapper";
import { QuickAddTaskModal } from "@/components/tasks/quick-add-task-modal";

const CLIENT_COLORS: Record<string, string> = {
  Andrea: "#22d3ee",
  Allen: "#a78bfa",
  Shawn: "#f472b6",
  "Perfect Stay": "#facc15",
  Jack: "#34d399",
};
const TASK_GENERATION_THROTTLE_MS = 5 * 60 * 1000;

export default async function DashboardPage() {
  const currentUser = await getCurrentUser();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: currentUser.id } });

  const team = await prisma.team.findUniqueOrThrow({
    where: { id: user.teamId },
    select: { lastGeneratedAt: true },
  });
  const shouldRefreshTasks =
    !team.lastGeneratedAt || Date.now() - team.lastGeneratedAt.getTime() >= TASK_GENERATION_THROTTLE_MS;

  if (shouldRefreshTasks) {
    await generateRecurringTaskInstances(user.teamId);
    await refreshOverdueTasks(user.teamId);
    await flagMissingCheckouts(user.teamId);
    await prisma.team.update({
      where: { id: user.teamId },
      data: { lastGeneratedAt: new Date() },
    });
  }

  const { stats, clientStats, operationRows, attendanceRows } = await getDashboardData(user.teamId);

  const today = new Date();
  const record = await prisma.attendanceRecord.findFirst({
    where: {
      userId: user.id,
      OR: [
        { actualCheckIn: { not: null }, actualCheckOut: null },
        { date: new Date(today.toISOString().slice(0, 10)) },
      ],
    },
    orderBy: { date: "desc" },
  });

  const [clients, employees, categories] = await Promise.all([
    prisma.client.findMany({ where: { teamId: user.teamId, active: true } }),
    prisma.user.findMany({ where: { teamId: user.teamId, active: true } }),
    prisma.category.findMany(),
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
            {greeting()}, Charlie Team 👋
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDateLong(today)} · {formatTime(today)} · Team Charlie
          </p>
        </div>
        <QuickAddTaskModal
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
          employees={employees.map((e) => ({ id: e.id, name: e.name }))}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <StatCard label="Today's Tasks" value={stats.todaysTasks} icon="list-checks" href="/tasks" tone="primary" />
        <StatCard label="Completed" value={stats.completed} icon="check-circle" href="/tasks?status=COMPLETED" tone="success" />
        <StatCard label="Pending" value={stats.pending} icon="clock" href="/tasks?status=UPCOMING" tone="info" />
        <StatCard label="Overdue" value={stats.overdue} icon="alert-octagon" href="/tasks?status=OVERDUE" tone="danger" />
        <StatCard label="Urgent Issues" value={stats.urgentIssues} icon="alert-triangle" href="/issues" tone="warning" />
        <StatCard label="Client Follow-ups" value={stats.followUpTasks} icon="message-square" href="/tasks?category=Follow-up" tone="info" />
        <StatCard
          label="Employees Checked In"
          value={stats.employeesCheckedIn}
          suffix={`/ ${stats.totalEmployees}`}
          icon="users"
          href="/attendance"
          tone="success"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Client status */}
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Client Status
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {clientStats.map((c) => (
                <ClientStatusCard key={c.id} {...c} />
              ))}
            </div>
          </div>

          <TodaysOperations rows={operationRows} />
        </div>

        <div className="space-y-6">
          <ShiftCard
            scheduledCheckIn={record?.scheduledCheckIn ?? null}
            scheduledCheckOut={record?.scheduledCheckOut ?? null}
            actualCheckIn={record?.actualCheckIn?.toISOString() ?? null}
            actualCheckOut={record?.actualCheckOut?.toISOString() ?? null}
          />
          <AttendanceWidget rows={attendanceRows} />
        </div>
      </div>

      <CharlieHq3DWrapper
        nodes={clientStats.map((c) => ({
          id: c.id,
          name: c.name,
          completedTasks: c.completedTasks,
          totalTasks: c.totalTasks,
          openIssues: c.openIssues,
          followUps: c.followUps,
          color: CLIENT_COLORS[c.name] ?? "#22d3ee",
        }))}
      />
    </div>
  );
}
