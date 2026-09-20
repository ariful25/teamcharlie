import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamId = (session.user as any).teamId as string;
  const body = await req.json();

  // Restoring is the one operation allowed on an already-deleted task — it's
  // how the "Recently Deleted" view undoes a soft delete. Everything else
  // below only ever touches a currently-active task.
  if (body.restore === true) {
    const deleted = await prisma.task.findFirst({ where: { id: params.id, teamId, deletedAt: { not: null } } });
    if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const task = await prisma.task.update({ where: { id: params.id }, data: { deletedAt: null, deletedBy: null } });
    return NextResponse.json({ task });
  }

  const existing = await prisma.task.findFirst({ where: { id: params.id, teamId, deletedAt: null } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
  const userId = (session.user as any).id as string;
  const existing = await prisma.task.findFirst({ where: { id: params.id, teamId, deletedAt: null } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Soft delete — see the Task.deletedAt comment in schema.prisma. A task
  // with an audit trail (completedAt/completedBy) must stay recoverable.
  await prisma.task.update({ where: { id: params.id }, data: { deletedAt: new Date(), deletedBy: userId } });
  return NextResponse.json({ ok: true });
}
