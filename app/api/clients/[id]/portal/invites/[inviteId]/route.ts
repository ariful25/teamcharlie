import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalManager } from "@/lib/portal/staff";

// Revoke a portal invite link that went to the wrong person.
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string; inviteId: string }> }) {
  const { id, inviteId } = await props.params;
  const auth = await requirePortalManager(id);
  if ("error" in auth) return auth.error;
  const r = await prisma.clientInvite.updateMany({ where: { id: inviteId, clientId: id, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
  if (!r.count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
