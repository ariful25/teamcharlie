// Server-side ONLY. Who on the staff side manages a client's portal access:
// Admin, or the team lead of the client's own team (lib/scope.ts decides
// reach). HR and employees don't hand out owner logins.
import { NextResponse } from "next/server";
import { getCurrentUserOrNull } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getScope, reachable } from "@/lib/scope";

export async function requirePortalManager(clientId: string) {
  const user = await getCurrentUserOrNull();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  if (user.role !== "ADMIN" && user.role !== "TEAM_LEAD") {
    return { error: NextResponse.json({ error: "Only an admin or the client's team lead manages portal access." }, { status: 403 }) } as const;
  }
  const client = await prisma.client.findFirst({ where: { id: clientId, ...reachable(await getScope(user)) }, select: { id: true, name: true, teamId: true } });
  if (!client) return { error: NextResponse.json({ error: "Client not found" }, { status: 404 }) } as const;
  return { user, client } as const;
}

export async function portalAccess(clientId: string) {
  const [users, invites] = await Promise.all([
    prisma.clientUser.findMany({ where: { clientId }, select: { id: true, name: true, email: true, active: true, lastLoginAt: true }, orderBy: { name: "asc" } }),
    prisma.clientInvite.findMany({
      where: { clientId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, name: true, email: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return {
    users: users.map((u) => ({ ...u, lastLoginAt: u.lastLoginAt?.toISOString() ?? null })),
    invites: invites.map((i) => ({ ...i, expiresAt: i.expiresAt.toISOString() })),
  };
}
