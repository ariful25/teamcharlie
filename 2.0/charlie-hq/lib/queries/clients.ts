import { prisma } from "@/lib/prisma";
import { startOfDayUTC } from "@/lib/time";

export async function getClientWorkspaceData(clientId: string) {
  const today = startOfDayUTC(new Date());

  const [client, tasks, recurringTasks, issues, properties, leads] = await Promise.all([
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
      include: { reportedBy: true, unit: { include: { property: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.property.findMany({
      where: { clientId, active: true },
      include: {
        units: {
          where: { active: true },
          include: {
            tenancies: { orderBy: [{ moveInDate: "desc" }, { createdAt: "desc" }] },
            childUnits: { where: { active: true }, select: { id: true, internalName: true } },
          },
          orderBy: { internalName: "asc" },
        },
      },
      orderBy: { internalCode: "asc" },
    }),
    prisma.lead.findMany({
      where: { clientId },
      include: { interestedUnit: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return { client, tasks, recurringTasks, issues, properties, leads };
}
