import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { runTeamMaintenance } from "@/lib/services/team-maintenance";
import { getTeamTimezone } from "@/lib/team-timezone";
import { getDashboardData } from "@/lib/queries/dashboard";
import { getShiftCardState } from "@/lib/queries/attendance";
import { formatDateLong, formatTime, greeting, startOfDayUTC } from "@/lib/time";
import { StatCard } from "@/components/dashboard/stat-card";
import { ClientStatusCard } from "@/components/dashboard/client-status-card";
import { TodaysOperations } from "@/components/dashboard/todays-operations";
import { SetupChecklist } from "@/components/dashboard/setup-checklist";
import { getSetupChecklist } from "@/lib/queries/setup";
import { ShiftCard } from "@/components/dashboard/shift-card";
import { AttendanceWidget } from "@/components/dashboard/attendance-widget";
import { CharlieHq3DWrapper } from "@/components/dashboard/charlie-hq-3d-wrapper";
import { QuickAddTaskModal } from "@/components/tasks/quick-add-task-modal";

// Assigned by each client's position in creation order, so colours stay
// stable for a team without hard-coding any one team's client names (this
// used to be a name->colour map of Team Charlie's clients).
const CLIENT_PALETTE = ["#22d3ee", "#a78bfa", "#f472b6", "#facc15", "#34d399", "#fb923c", "#60a5fa", "#f87171"];

export default async function DashboardPage() {
  const currentUser = await getCurrentUser();

  await runTeamMaintenance(currentUser.teamId);

  const today = new Date();
  const [tz, team] = await Promise.all([
    getTeamTimezone(currentUser.teamId),
    prisma.team.findUniqueOrThrow({ where: { id: currentUser.teamId }, select: { name: true } }),
  ]);

  // Every read below is independent — one round trip instead of three.
  const [{ stats, clientStats, operationRows, attendanceRows }, shiftState, clients, employees, categories, shiftTypes, checkoutChecklistItems] =
    await Promise.all([
      getDashboardData(currentUser.teamId),
      getShiftCardState(currentUser.id),
      prisma.client.findMany({ where: { teamId: currentUser.teamId, active: true }, orderBy: { createdAt: "asc" } }),
      prisma.user.findMany({ where: { teamId: currentUser.teamId, active: true } }),
      prisma.category.findMany({ where: { teamId: currentUser.teamId }, orderBy: { name: "asc" } }),
      prisma.shiftType.findMany({ where: { teamId: currentUser.teamId, active: true }, orderBy: { startTime: "asc" } }),
      prisma.checklistItem.findMany({
        where: { teamId: currentUser.teamId, type: "CHECKOUT", active: true },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      }),
    ]);
  const setup = currentUser.role === "ADMIN" ? await getSetupChecklist(currentUser.teamId) : [];

  const clientColor = new Map(clients.map((c, i) => [c.id, CLIENT_PALETTE[i % CLIENT_PALETTE.length]]));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
            {greeting(today, tz)}, {currentUser.name.split(" ")[0] || team.name} 👋
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDateLong(today, tz)} · {formatTime(today, tz)} · {team.name}
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

      <SetupChecklist items={setup} />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-golden">
        <div className="min-w-0 space-y-8">
          {/* Client status */}
          <div>
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
              Client Status
            </h2>
            {clientStats.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                No clients yet.{" "}
                <Link href="/clients" className="font-medium text-primary hover:brightness-110">
                  Add your first client
                </Link>{" "}
                to track their tasks and follow-ups here.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {clientStats.map((c) => (
                  <ClientStatusCard key={c.id} {...c} />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <ShiftCard
            state={shiftState}
            checklistItems={checkoutChecklistItems.map((c) => ({ id: c.id, label: c.label }))}
            leads={employees.filter((e) => e.role === "ADMIN" || e.role === "TEAM_LEAD").map((e) => ({ id: e.id, name: e.name }))}
          />
          <AttendanceWidget rows={attendanceRows} />
        </div>
      </div>

      {/* Full width: a table needs width more than anything else on the page. */}
      <TodaysOperations rows={operationRows} />

      <CharlieHq3DWrapper
        teamName={team.name}
        nodes={clientStats.map((c) => ({
          id: c.id,
          name: c.name,
          completedTasks: c.completedTasks,
          totalTasks: c.totalTasks,
          followUps: c.followUps,
          color: clientColor.get(c.id) ?? CLIENT_PALETTE[0],
        }))}
      />
    </div>
  );
}
