import { walls } from "@/lib/scope";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = session.user.role;
  if (!permissions.canManageClientFiles(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { teamId, clientWall } = await walls();
  const existing = await prisma.clientFile.findFirst({ where: { id: params.id, client: clientWall } });
  if (!existing) return NextResponse.json({ error: "File not found" }, { status: 404 });

  await prisma.clientFile.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
