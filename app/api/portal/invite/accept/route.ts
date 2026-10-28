import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { inviteAcceptSchema } from "@/lib/validations";
import { findUsableClientInvite } from "@/lib/portal/invites";
import { allowRequest, clientIp } from "@/lib/rate-limit";

// Public: turns a portal invite link into an owner account for that one
// client. The email is always the invited one, never taken from the body.
export async function POST(req: NextRequest) {
  if (!(await allowRequest(`portal-accept:${clientIp(req.headers)}`, 20, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Try again in an hour." }, { status: 429 });
  }
  const parsed = inviteAcceptSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  const invite = await findUsableClientInvite(parsed.data.token);
  if (!invite) return NextResponse.json({ error: "This link is invalid, expired or already used. Ask your property team for a new one." }, { status: 404 });
  if (await prisma.clientUser.findUnique({ where: { email: invite.email }, select: { id: true } })) {
    return NextResponse.json({ error: "This email already has a portal account. Sign in instead." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  // Claim the link and create the account together: two clicks can't both win.
  const created = await prisma.$transaction(async (tx) => {
    const claimed = await tx.clientInvite.updateMany({ where: { id: invite.id, acceptedAt: null, revokedAt: null }, data: { acceptedAt: new Date() } });
    if (claimed.count === 0) return null;
    return tx.clientUser.create({
      data: { teamId: invite.teamId, clientId: invite.clientId, name: parsed.data.name, email: invite.email, passwordHash },
      select: { email: true },
    });
  });
  if (!created) return NextResponse.json({ error: "This link has already been used." }, { status: 409 });
  return NextResponse.json({ ok: true, email: created.email });
}
