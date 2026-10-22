import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserOrNull } from "@/lib/session";
import { permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Revoke a pending invite — its link stops working immediately.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const currentUser = await getCurrentUserOrNull();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!permissions.canManageUsers(currentUser.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await prisma.teamInvite.updateMany({
    where: { id: params.id, teamId: currentUser.teamId, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
