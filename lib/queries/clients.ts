import { prisma } from "@/lib/prisma";
import { startOfDayUTC } from "@/lib/time";

export async function getClientWorkspaceData(clientId: string, teamId: string) {
  const today = startOfDayUTC(new Date());

  const client = await prisma.client.findFirst({ where: { id: clientId, teamId } });
  if (!client) {
    return { client: null, tasks: [], recurringTasks: [], properties: [], leads: [] };
  }

  const [tasks, recurringTasks, properties, leads] = await Promise.all([
    prisma.task.findMany({
      where: { clientId, teamId, date: today, deletedAt: null },
      include: { assignedUser: true, category: true },
      orderBy: { startTime: "asc" },
    }),
    prisma.task.findMany({
      where: { clientId, teamId, isRecurringTemplate: true, deletedAt: null },
      include: { assignedUser: true, category: true },
    }),
    prisma.property.findMany({
      where: { clientId, active: true, client: { teamId } },
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
      where: { clientId, client: { teamId } },
      include: { interestedUnit: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return { client, tasks, recurringTasks, properties, leads };
}
