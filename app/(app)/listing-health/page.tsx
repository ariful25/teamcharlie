import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { permissions } from "@/lib/auth";
import { defaultClientId, getPortfolio } from "@/lib/listing-health/queries";
import { ListingHealthPortfolio } from "@/components/listing-health/portfolio";
import { Card, CardContent } from "@/components/ui/card";
import { isAiReady } from "@/lib/ai/client";
import { listInbox } from "@/lib/listing-health/inbox";

export default async function ListingHealthPage({ searchParams }: { searchParams: { clientId?: string } }) {
  const currentUser = await getCurrentUser();
  const clients = await prisma.client.findMany({
    where: { teamId: currentUser.teamId, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const clientId = searchParams.clientId ?? (await defaultClientId(currentUser.teamId)) ?? clients[0]?.id;
  if (!clientId) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">Add a client and its listings in the Knowledge Base first.</CardContent>
      </Card>
    );
  }
  const canManage = permissions.canManageKnowledgeBase(currentUser.role);
  const [data, aiReady, inbox, teamListings] = await Promise.all([
    getPortfolio(currentUser.teamId, clientId),
    isAiReady(currentUser.teamId),
    canManage ? listInbox(currentUser.teamId) : Promise.resolve([]),
    canManage
      ? prisma.propertyKnowledgeItem.findMany({
          where: { client: { teamId: currentUser.teamId } },
          select: { id: true, internalName: true, client: { select: { name: true } } },
          orderBy: { internalName: "asc" },
        })
      : Promise.resolve([]),
  ]);
  if (!data) redirect("/listing-health");

  return (
    <ListingHealthPortfolio
      clients={clients}
      clientId={clientId}
      rows={data.rows}
      summary={data.summary}
      canManage={canManage}
      aiReady={aiReady}
      inbox={inbox}
      teamListings={teamListings.map((l) => ({ id: l.id, name: clients.length > 1 ? `${l.internalName} · ${l.client.name}` : l.internalName }))}
    />
  );
}
