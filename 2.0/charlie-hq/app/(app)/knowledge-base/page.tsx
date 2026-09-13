import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { permissions } from "@/lib/auth";
import { KnowledgeBaseManager } from "@/components/knowledge-base/knowledge-base-manager";

export default async function KnowledgeBasePage({
  searchParams,
}: {
  searchParams?: { clientId?: string };
}) {
  const currentUser = await getCurrentUser();
  const canManage = permissions.canManageKnowledgeBase(currentUser.role);

  const [clients, items] = await Promise.all([
    prisma.client.findMany({
      where: { teamId: currentUser.teamId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.propertyKnowledgeItem.findMany({
      where: { client: { teamId: currentUser.teamId } },
      include: { client: { select: { id: true, name: true } } },
      orderBy: [{ createdAt: "desc" }],
    }),
  ]);

  return (
    <KnowledgeBaseManager
      clients={clients}
      items={JSON.parse(JSON.stringify(items))}
      canManage={canManage}
      initialClientId={searchParams?.clientId}
    />
  );
}
