import { prisma } from "@/lib/prisma";
import { startOfDayUTC } from "@/lib/time";

export async function getTasksPageData(teamId: string) {
  const today = startOfDayUTC(new Date());
  const [tasks, clients, employees, categories] = await Promise.all([
    prisma.task.findMany({
      where: {
        teamId,
        deletedAt: null,
        // Today's tasks (any status), plus anything from an earlier day
        // that's still not COMPLETED — incomplete work stays on the board
        // until someone actually deals with it, instead of silently
        // dropping off the moment its original day ends.
        OR: [{ date: today }, { date: { lt: today }, status: { not: "COMPLETED" } }],
      },
      include: { client: true, category: true, assignedUser: true },
      orderBy: { startTime: "asc" },
    }),
    prisma.client.findMany({ where: { teamId, active: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { teamId, active: true }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  return { tasks, clients, employees, categories };
}
