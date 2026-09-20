import { prisma } from "@/lib/prisma";
import { startOfDayUTC } from "@/lib/time";

export async function getTasksPageData(teamId: string) {
  const today = startOfDayUTC(new Date());
  const [tasks, clients, employees, categories] = await Promise.all([
    prisma.task.findMany({
      where: { teamId, date: today, deletedAt: null },
      include: { client: true, category: true, assignedUser: true },
      orderBy: { startTime: "asc" },
    }),
    prisma.client.findMany({ where: { teamId, active: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { teamId, active: true }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  return { tasks, clients, employees, categories };
}
