import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

export const INVITE_TTL_DAYS = 7;

/** A new invite token: the raw value goes in the link only, the hash in the DB. */
export function newInviteToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** The invite for a raw token if it can still be accepted, else null. */
export async function findUsableInvite(token: string) {
  if (!token || token.length > 200) return null;
  const invite = await prisma.teamInvite.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    include: { team: { select: { id: true, name: true } } },
  });
  if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt.getTime() < Date.now()) return null;
  return invite;
}
