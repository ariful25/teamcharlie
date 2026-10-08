import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { generateRecurringTaskInstances, refreshOverdueTasks } from "@/lib/services/task-generation";
import { flagMissingCheckouts } from "@/lib/services/attendance";
import { getDashboardData } from "@/lib/queries/dashboard";
import { formatDateLong, formatTime, greeting, startOfDayUTC } from "@/lib/time";
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

  const team = await prisma.team.findUniqueOrThrow({
    where: { id: currentUser.teamId },
    select: { lastGeneratedAt: true },
  });
  const shouldRefreshTasks =
    !team.lastGeneratedAt || Date.now() - team.lastGeneratedAt.getTime() >= TASK_GENERATION_THROTTLE_MS;

  if (shouldRefreshTasks) {
    // Independent of each other — different tables, no shared state — so
    // they run concurrently instead of one after another. This throttled
    // maintenance work (only runs once per 5-minute window) was previously
    // the single biggest contributor to a slow dashboard load: 3 sequential
    // multi-query service calls on the critical render path.
    await Promise.all([
      generateRecurringTaskInstances(currentUser.teamId),
      refreshOverdueTasks(currentUser.teamId),
      flagMissingCheckouts(currentUser.teamId),
    ]);
    await prisma.team.update({
      where: { id: currentUser.teamId },
      data: { lastGeneratedAt: new Date() },
    });
  }

  const today = new Date();

  // Every read below is independent — one round trip instead of three.
  const [{ stats, clientStats, operationRows, attendanceRows }, record, clients, employees, categories, shiftTypes] =
    await Promise.all([
      getDashboardData(currentUser.teamId),
      prisma.attendanceRecord.findFirst({
        where: {
          userId: currentUser.id,
          OR: [
            { actualCheckIn: { not: null }, actualCheckOut: null },
            // startOfDayUTC converts to the team's timezone first, then
            // takes the calendar day — a raw `today.toISOString().slice(0, 10)`
            // takes the UTC calendar day instead, which is a different date
            // for part of the day in Asia/Dhaka (UTC+6). That mismatch made
            // this query keep matching yesterday's already-completed
            // AttendanceRecord for several hours after local midnight,
            // instead of finding (or being ready to create) today's.
            { date: startOfDayUTC(today) },
          ],
        },
        orderBy: { date: "desc" },
      }),
      prisma.client.findMany({ where: { teamId: currentUser.teamId, active: true } }),
      prisma.user.findMany({ where: { teamId: currentUser.teamId, active: true } }),
      prisma.category.findMany(),
      prisma.shiftType.findMany({ where: { teamId: currentUser.teamId, active: true }, orderBy: { startTime: "asc" } }),
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
          shiftTypes={shiftTypes.map((s) => ({ id: s.id, name: s.name }))}
        />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <StatCard label="Today's Tasks" value={stats.todaysTasks} icon="list-checks" href="/tasks" tone="primary" />
        <StatCard label="Completed" value={stats.completed} icon="check-circle" href="/tasks?status=COMPLETED" tone="success" />
        <StatCard label="Pending" value={stats.pending} icon="clock" href="/tasks?status=UPCOMING" tone="info" />
        <StatCard label="Overdue" value={stats.overdue} icon="alert-octagon" href="/tasks?status=OVERDUE" tone="danger" />
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
          followUps: c.followUps,
          color: CLIENT_COLORS[c.name] ?? "#22d3ee",
        }))}
      />
    </div>
  );
}
