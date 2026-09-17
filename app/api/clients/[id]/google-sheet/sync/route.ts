import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncClientKnowledgeBase } from "@/lib/google-sheets/sync";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!permissions.canManageGoogleSheets(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = (session.user as any).teamId as string;
  const client = await prisma.client.findFirst({ where: { id: params.id, teamId }, select: { id: true } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  try {
    const result = await syncClientKnowledgeBase(params.id);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Sync failed." }, { status: 502 });
  }
}
