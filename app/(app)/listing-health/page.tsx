import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { permissions } from "@/lib/auth";
import { defaultClientId, getPortfolio } from "@/lib/listing-health/queries";
import { ListingHealthPortfolio } from "@/components/listing-health/portfolio";
import { Card, CardContent } from "@/components/ui/card";

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
  const data = await getPortfolio(currentUser.teamId, clientId);
  if (!data) redirect("/listing-health");

  return (
    <ListingHealthPortfolio
      clients={clients}
      clientId={clientId}
      rows={data.rows}
      summary={data.summary}
      canManage={permissions.canManageKnowledgeBase(currentUser.role)}
    />
  );
}
