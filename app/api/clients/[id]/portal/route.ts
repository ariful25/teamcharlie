import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { portalInviteSchema } from "@/lib/validations";
import { createClientInvite } from "@/lib/portal/invites";
import { portalAccess, requirePortalManager } from "@/lib/portal/staff";

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const auth = await requirePortalManager(id);
  if ("error" in auth) return auth.error;
  return NextResponse.json(await portalAccess(id));
}

// Invite an owner to this client's portal. The link is returned once.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const auth = await requirePortalManager(id);
  if ("error" in auth) return auth.error;
  const parsed = portalInviteSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const email = parsed.data.email.toLowerCase();
  if (await prisma.clientUser.findUnique({ where: { email }, select: { id: true } })) {
    return NextResponse.json({ error: "That email already has a portal account." }, { status: 409 });
  }
  const { invite, link } = await createClientInvite(
    { teamId: auth.client.teamId, clientId: id, email, name: parsed.data.name, createdBy: auth.user.id },
    req.nextUrl.origin
  );
  return NextResponse.json({ invite, link, clientName: auth.client.name });
}
