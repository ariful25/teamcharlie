import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { taskSchema } from "@/lib/validations";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamId = (session.user as any).teamId as string;
  const { searchParams } = new URL(req.url);

  const status = searchParams.get("status");
  const clientId = searchParams.get("clientId");
  const assignedUserId = searchParams.get("assignedUserId");
  const category = searchParams.get("category");
  // ?deleted=true powers a "Recently Deleted" view — everything else only
  // ever sees non-deleted tasks.
  const showDeleted = searchParams.get("deleted") === "true";

  const tasks = await prisma.task.findMany({
    where: {
      teamId,
      deletedAt: showDeleted ? { not: null } : null,
      ...(status ? { status: status as any } : {}),
      ...(clientId ? { clientId } : {}),
      ...(assignedUserId ? { assignedUserId } : {}),
      ...(category ? { category: { name: category } } : {}),
    },
    include: { client: true, category: true, assignedUser: true },
    orderBy: [{ date: "desc" }, { startTime: "asc" }],
  });

  return NextResponse.json({ tasks });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamId = (session.user as any).teamId as string;
  const body = await req.json();
  const parsed = taskSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const data = parsed.data;

  if (data.clientId) {
    const client = await prisma.client.findFirst({ where: { id: data.clientId, teamId } });
    if (!client) return NextResponse.json({ error: "Invalid clientId" }, { status: 400 });
  }
  if (data.assignedUserId) {
    const assignee = await prisma.user.findFirst({ where: { id: data.assignedUserId, teamId } });
    if (!assignee) return NextResponse.json({ error: "Invalid assignedUserId" }, { status: 400 });
  }

  const isRecurring = data.repeatMode && data.repeatMode !== "NONE";
  const teamUserId = (session.user as any).id as string;

  const task = await prisma.task.create({
    data: {
      title: data.title,
      description: data.description,
      clientId: data.clientId || null,
      propertyName: data.propertyName || null,
      categoryId: data.categoryId || null,
      assignedUserId: data.assignedUserId || null,
      date: new Date(`${data.date}T00:00:00.000Z`),
      startTime: data.startTime || null,
      dueTime: data.dueTime || null,
      priority: data.priority,
      status: data.status,
      blockedReason: data.status === "BLOCKED" ? data.blockedReason || null : null,
      // Match the PATCH route's rule: completion is always explicit and
      // auditable, even when a task is created already-Completed rather
      // than transitioned there later.
      ...(data.status === "COMPLETED" ? { completedAt: new Date(), completedBy: teamUserId } : {}),
      teamId,
      // Recurrence lives directly on the Task row. If this task repeats, it becomes
      // its own template: lib/services/task-generation.ts spawns a fresh plain task
      // instance from it on each future day it's due, without a separate entity.
      isRecurringTemplate: !!isRecurring,
      repeatMode: data.repeatMode ?? "NONE",
      repeatDays: data.repeatDays ?? [],
    },
  });

  return NextResponse.json({ task });
}
