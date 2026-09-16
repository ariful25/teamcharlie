import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const teamId = (session.user as any).teamId as string;

  const issues = await prisma.issue.findMany({
    where: { teamId },
    include: { client: true, reportedBy: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ issues });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamId = (session.user as any).teamId as string;
  const userId = (session.user as any).id as string;
  const body = await req.json();

  if (!body.title) return NextResponse.json({ error: "Title is required" }, { status: 400 });

  if (body.clientId) {
    const client = await prisma.client.findFirst({ where: { id: body.clientId, teamId } });
    if (!client) return NextResponse.json({ error: "Invalid clientId" }, { status: 400 });
  }
  if (body.unitId) {
    const unit = await prisma.unit.findFirst({ where: { id: body.unitId, property: { client: { teamId } } } });
    if (!unit) return NextResponse.json({ error: "Invalid unitId" }, { status: 400 });
  }

  const issue = await prisma.issue.create({
    data: {
      title: body.title,
      description: body.description || null,
      clientId: body.clientId || null,
      unitId: body.unitId || null,
      severity: body.severity || "MEDIUM",
      teamId,
      reportedById: userId,
    },
  });

  return NextResponse.json({ issue });
}
