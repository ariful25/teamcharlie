import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamId = (session.user as any).teamId as string;
  const existing = await prisma.task.findFirst({ where: { id: params.id, teamId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const userId = (session.user as any).id as string;

  if (body.assignedUserId !== undefined && body.assignedUserId !== null) {
    const assignee = await prisma.user.findFirst({ where: { id: body.assignedUserId, teamId } });
    if (!assignee) return NextResponse.json({ error: "Invalid assignedUserId" }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};
  if (body.status) {
    updateData.status = body.status;
    if (body.status === "COMPLETED") {
      updateData.completedAt = new Date();
      updateData.completedBy = userId;
    }
  }
  if (body.blockedReason !== undefined) updateData.blockedReason = body.blockedReason;
  if (body.assignedUserId !== undefined) updateData.assignedUserId = body.assignedUserId;
  if (body.priority) updateData.priority = body.priority;

  // Editing a generated task instance only ever touches this Task row — it never
  // mutates the recurring template it may have come from (Task.isRecurringTemplate).
  const task = await prisma.task.update({
    where: { id: params.id },
    data: updateData,
  });

  return NextResponse.json({ task });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamId = (session.user as any).teamId as string;
  const existing = await prisma.task.findFirst({ where: { id: params.id, teamId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.task.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
