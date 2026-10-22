import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserOrNull } from "@/lib/session";
import { permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { inviteCreateSchema } from "@/lib/validations";
import { INVITE_TTL_DAYS, newInviteToken } from "@/lib/invites";

export async function GET() {
  const currentUser = await getCurrentUserOrNull();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!permissions.canManageUsers(currentUser.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const invites = await prisma.teamInvite.findMany({
    where: { teamId: currentUser.teamId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ invites });
}

// Creates a single-use invite and returns its link once — the raw token is
// never stored (only its hash), so a lost link means revoking and re-inviting.
// There's no outbound email service configured, so the admin copies the link
// and sends it themselves.
export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUserOrNull();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!permissions.canManageUsers(currentUser.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = inviteCreateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase();

  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    return NextResponse.json({ error: "Someone with that email already has an account." }, { status: 409 });
  }

  // Re-inviting the same address replaces the old link instead of leaving
  // two live ones around.
  await prisma.teamInvite.updateMany({
    where: { teamId: currentUser.teamId, email, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  const { token, tokenHash } = newInviteToken();
  const invite = await prisma.teamInvite.create({
    data: {
      teamId: currentUser.teamId,
      email,
      role: parsed.data.role,
      tokenHash,
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
      createdBy: currentUser.id,
    },
    select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
  });

  const origin = process.env.NEXTAUTH_URL || req.nextUrl.origin;
  return NextResponse.json({ invite, link: `${origin.replace(/\/$/, "")}/invite/${token}` });
}
