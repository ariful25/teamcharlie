// Server-side ONLY. Portal invites: same single-use, hashed, 7-day links as
// staff invites (lib/invites.ts), but they create a ClientUser for one client.
import { prisma } from "@/lib/prisma";
import { INVITE_TTL_DAYS, hashInviteToken, newInviteToken } from "@/lib/invites";

export async function createClientInvite(input: { teamId: string; clientId: string; email: string; name: string; createdBy: string }, origin: string) {
  const email = input.email.toLowerCase();
  // Re-inviting the same address replaces the old link.
  await prisma.clientInvite.updateMany({ where: { clientId: input.clientId, email, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
  const { token, tokenHash } = newInviteToken();
  const invite = await prisma.clientInvite.create({
    data: { teamId: input.teamId, clientId: input.clientId, email, name: input.name, tokenHash, createdBy: input.createdBy, expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000) },
    select: { id: true, email: true, name: true, expiresAt: true },
  });
  return { invite, link: `${origin}/portal/invite/${token}` };
}

export async function findUsableClientInvite(token: string) {
  if (!token || token.length > 200) return null;
  const invite = await prisma.clientInvite.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    include: { client: { select: { name: true, active: true } } },
  });
  if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt.getTime() < Date.now() || !invite.client.active) return null;
  return invite;
}
