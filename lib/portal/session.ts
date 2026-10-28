import { cache } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type PortalUser = { id: string; name: string; email: string; clientId: string; clientName: string; teamId: string };

/** The signed-in property owner, re-read from the database on every request:
 *  a deactivated owner, or a deactivated client, loses access at once. A
 *  staff session is not a portal session. */
export const getPortalUserOrNull = cache(async (): Promise<PortalUser | null> => {
  const session = await getServerSession(authOptions);
  const token = session?.user;
  if (token?.kind !== "client" || !token.id || !token.clientId) return null;
  const owner = await prisma.clientUser.findUnique({
    where: { id: token.id },
    select: { id: true, name: true, email: true, active: true, clientId: true, teamId: true, client: { select: { name: true, active: true } } },
  });
  if (!owner?.active || !owner.client.active || owner.clientId !== token.clientId) return null;
  return { id: owner.id, name: owner.name, email: owner.email, clientId: owner.clientId, clientName: owner.client.name, teamId: owner.teamId };
});

export async function getPortalUser(): Promise<PortalUser> {
  const owner = await getPortalUserOrNull();
  if (!owner) redirect("/portal/login");
  return owner;
}
