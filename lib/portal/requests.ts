// Server-side ONLY. Owner requests: each one is also a task for the client's
// team, and finishing that task closes the request.
import { prisma } from "@/lib/prisma";
import { getTeamTimezone } from "@/lib/team-timezone";
import { startOfDayUTC } from "@/lib/time";
import type { PortalUser } from "./session";
import { requestIdFromSourceRef, requestSourceRef, requestTask, type RequestKind } from "./rules";

export async function createClientRequest(owner: PortalUser, input: { kind: RequestKind; message: string; propertyId?: string | null }) {
  const listing = input.propertyId
    ? await prisma.propertyKnowledgeItem.findFirst({ where: { id: input.propertyId, clientId: owner.clientId }, select: { id: true, internalName: true, listingName: true } })
    : null;
  if (input.propertyId && !listing) return null;
  const client = await prisma.client.findFirstOrThrow({ where: { id: owner.clientId, teamId: owner.teamId }, select: { name: true, squadId: true } });
  const today = startOfDayUTC(new Date(), await getTeamTimezone(owner.teamId));
  const task = requestTask(input.kind, client.name, listing?.internalName ?? null, `${input.message}\n\nFrom ${owner.name} (owner portal).`);

  return prisma.$transaction(async (tx) => {
    const request = await tx.clientRequest.create({
      data: { teamId: owner.teamId, clientId: owner.clientId, clientUserId: owner.id, propertyId: listing?.id ?? null, kind: input.kind, message: input.message },
    });
    const created = await tx.task.create({
      data: {
        teamId: owner.teamId,
        squadId: client.squadId,
        clientId: owner.clientId,
        propertyName: listing?.internalName ?? null,
        title: task.title,
        description: task.description,
        priority: task.priority,
        date: today,
        sourceRef: requestSourceRef(request.id),
      },
    });
    return tx.clientRequest.update({
      where: { id: request.id },
      data: { taskId: created.id },
      select: { id: true, kind: true, message: true, status: true, createdAt: true },
    });
  });
}

/** Called when a task is completed on the board (app/api/tasks/[id]). */
export async function onClientRequestTaskCompleted(teamId: string, sourceRef: string | null) {
  const id = requestIdFromSourceRef(sourceRef);
  if (!id) return;
  await prisma.clientRequest.updateMany({ where: { id, teamId, status: "OPEN" }, data: { status: "DONE", resolvedAt: new Date() } });
}
