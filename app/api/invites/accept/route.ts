import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { inviteAcceptSchema } from "@/lib/validations";
import { findUsableInvite } from "@/lib/invites";
import { allowRequest, clientIp } from "@/lib/rate-limit";

// Public: turns a valid invite link into an account on the inviting team.
// The email is always the one the admin invited — never taken from the body.
export async function POST(req: NextRequest) {
  if (!allowRequest(`invite-accept:${clientIp(req)}`, 20, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const parsed = inviteAcceptSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const invite = await findUsableInvite(parsed.data.token);
  if (!invite) {
    return NextResponse.json({ error: "This invite link is invalid, expired, or already used." }, { status: 404 });
  }
  if (await prisma.user.findUnique({ where: { email: invite.email }, select: { id: true } })) {
    return NextResponse.json({ error: "An account with this email already exists. Sign in instead." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  // Claim the invite and create the user atomically — the conditional
  // updateMany means two simultaneous accepts of one link can't both succeed.
  const created = await prisma.$transaction(async (tx) => {
    const claimed = await tx.teamInvite.updateMany({
      where: { id: invite.id, acceptedAt: null, revokedAt: null },
      data: { acceptedAt: new Date() },
    });
    if (claimed.count === 0) return null;
    return tx.user.create({
      data: { name: parsed.data.name, email: invite.email, passwordHash, role: invite.role, teamId: invite.teamId },
      select: { email: true },
    });
  });

  if (!created) {
    return NextResponse.json({ error: "This invite link has already been used." }, { status: 409 });
  }
  return NextResponse.json({ ok: true, email: created.email });
}
