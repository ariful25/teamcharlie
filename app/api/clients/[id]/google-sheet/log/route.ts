import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamId = (session.user as any).teamId as string;
  const client = await prisma.client.findFirst({ where: { id: params.id, teamId }, select: { id: true } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const logs = await prisma.knowledgeSyncLog.findMany({
    where: { clientId: params.id },
    include: { property: { select: { internalName: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ logs });
}
