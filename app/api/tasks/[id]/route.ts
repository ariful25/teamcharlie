import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { taskEditSchema } from "@/lib/validations";
import { notifyTaskEdited, notifyTaskDeleted, notifyTaskStatusChanged } from "@/lib/notifications";

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

  // The full edit form (title/client/property/category/assignee/date/times/
  // priority/notes) — kept as its own branch, separate from the lightweight
  // status/blockedReason/priority PATCH below, since they come from very
  // different UI flows (the detail dialog's edit form vs. dragging a Kanban
  // card) and shouldn't share one loosely-typed body shape.
  if (body.edit === true) {
    const parsed = taskEditSchema.safeParse(body);
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

    const instanceData: Record<string, unknown> = {};
    if (data.title !== undefined) instanceData.title = data.title;
    if (data.clientId !== undefined) instanceData.clientId = data.clientId || null;
    if (data.propertyName !== undefined) instanceData.propertyName = data.propertyName || null;
    if (data.categoryId !== undefined) instanceData.categoryId = data.categoryId || null;
    if (data.assignedUserId !== undefined) instanceData.assignedUserId = data.assignedUserId || null;
    if (data.date !== undefined) instanceData.date = new Date(`${data.date}T00:00:00.000Z`);
    if (data.startTime !== undefined) instanceData.startTime = data.startTime || null;
    if (data.dueTime !== undefined) instanceData.dueTime = data.dueTime || null;
    if (data.priority !== undefined) instanceData.priority = data.priority;
    if (data.notes !== undefined) instanceData.notes = data.notes || null;

    const task = await prisma.task.update({
      where: { id: params.id },
      data: instanceData,
      include: { client: true, assignedUser: true },
    });
    await notifyTaskEdited(task, session.user.name ?? "Someone");

    // "Also apply to future occurrences" pushes only the content fields —
    // never date, status, or assignedUserId, which are instance-specific (a
    // shift-linked series resolves its own assignee per day; overwriting the
    // template's assignedUserId here would fight that) — onto the recurring
    // template, so tomorrow's generated instance picks up the fix too.
    // Resolves to the template whether this row IS the template or is an
    // instance pointing at one via recurringTemplateId.
    if (data.applyToSeries) {
      const templateId = existing.isRecurringTemplate ? existing.id : existing.recurringTemplateId;
      if (templateId) {
        const seriesData: Record<string, unknown> = {};
        if (data.title !== undefined) seriesData.title = data.title;
        if (data.clientId !== undefined) seriesData.clientId = data.clientId || null;
        if (data.propertyName !== undefined) seriesData.propertyName = data.propertyName || null;
        if (data.categoryId !== undefined) seriesData.categoryId = data.categoryId || null;
        if (data.startTime !== undefined) seriesData.startTime = data.startTime || null;
        if (data.dueTime !== undefined) seriesData.dueTime = data.dueTime || null;
        if (data.priority !== undefined) seriesData.priority = data.priority;
        if (data.notes !== undefined) seriesData.notes = data.notes || null;
        if (Object.keys(seriesData).length > 0) {
          await prisma.task.update({ where: { id: templateId }, data: seriesData });
        }
      }
    }

    return NextResponse.json({ task });
  }

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
    include: { client: true, assignedUser: true },
  });

  // A status change gets its own templated message (In Progress/Completed/
  // Blocked); any other lightweight field change (priority, reassignment)
  // falls back to the generic "updated" message. Never both for one PATCH.
  const actorName = session.user.name ?? "Someone";
  if (body.status && ["IN_PROGRESS", "COMPLETED", "BLOCKED"].includes(body.status)) {
    await notifyTaskStatusChanged(task, body.status, actorName);
  } else if (Object.keys(updateData).length > 0) {
    await notifyTaskEdited(task, actorName);
  }

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
  const task = await prisma.task.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), deletedBy: userId },
    include: { client: true, assignedUser: true },
  });
  await notifyTaskDeleted(task, session.user.name ?? "Someone");
  return NextResponse.json({ ok: true });
}
