import { getScope, inSquad } from "@/lib/scope";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { permissions } from "@/lib/auth";
import { KnowledgeBaseManager } from "@/components/knowledge-base/knowledge-base-manager";

export default async function KnowledgeBasePage(
  props: {
    searchParams?: Promise<{ clientId?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const currentUser = await getCurrentUser();
  const scope = await getScope(currentUser);
  const canManage = permissions.canManageKnowledgeBase(currentUser.role);

  const [clients, items] = await Promise.all([
    prisma.client.findMany({
      where: { ...inSquad(scope), active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.propertyKnowledgeItem.findMany({
      where: { client: inSquad(scope) },
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
