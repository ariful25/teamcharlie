import { getCurrentUser } from "@/lib/session";
import { getTaskHistory } from "@/lib/queries/tasks";
import { prisma } from "@/lib/prisma";
import { TaskHistoryView } from "@/components/tasks/task-history-view";

export default async function TaskHistoryPage({
  searchParams,
}: {
  searchParams: { status?: string; clientId?: string; assignedUserId?: string; from?: string; to?: string };
}) {
  const currentUser = await getCurrentUser();

  const status = (searchParams.status as "ALL" | "COMPLETED" | "DELETED") ?? "ALL";

  const [tasks, clients, employees] = await Promise.all([
    getTaskHistory(currentUser.teamId, {
      status,
      clientId: searchParams.clientId,
      assignedUserId: searchParams.assignedUserId,
      from: searchParams.from,
      to: searchParams.to,
    }),
    prisma.client.findMany({ where: { teamId: currentUser.teamId, active: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { teamId: currentUser.teamId, active: true }, orderBy: { name: "asc" } }),
  ]);

  const plainTasks = JSON.parse(JSON.stringify(tasks));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Task History</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Completed and deleted tasks — nothing that leaves the board disappears, it just moves here.
        </p>
      </div>
      <TaskHistoryView
        tasks={plainTasks}
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        employees={employees.map((e) => ({ id: e.id, name: e.name }))}
        filters={{ status, clientId: searchParams.clientId ?? "", assignedUserId: searchParams.assignedUserId ?? "", from: searchParams.from ?? "", to: searchParams.to ?? "" }}
      />
    </div>
  );
}
