import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!permissions.canManageClientFiles(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = (session.user as any).teamId as string;
  const existing = await prisma.clientFile.findFirst({ where: { id: params.id, client: { teamId } } });
  if (!existing) return NextResponse.json({ error: "File not found" }, { status: 404 });

  await prisma.clientFile.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
