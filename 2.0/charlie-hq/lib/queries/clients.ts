import { prisma } from "@/lib/prisma";
import { startOfDayUTC } from "@/lib/time";

export async function getClientWorkspaceData(clientId: string) {
  const today = startOfDayUTC(new Date());

  const [client, tasks, recurringTasks, issues] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId } }),
    prisma.task.findMany({
      where: { clientId, date: today },
      include: { assignedUser: true, category: true },
      orderBy: { startTime: "asc" },
    }),
    prisma.task.findMany({
      where: { clientId, isRecurringTemplate: true },
      include: { assignedUser: true, category: true },
    }),
    prisma.issue.findMany({
      where: { clientId },
      include: { reportedBy: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return { client, tasks, recurringTasks, issues };
}
