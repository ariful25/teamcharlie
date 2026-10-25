import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { taskEditSchema, taskQuickUpdateSchema } from "@/lib/validations";
import { combineDateAndTime } from "@/lib/time";
import { getTeamTimezone } from "@/lib/team-timezone";
import { onStayTaskCompleted } from "@/lib/reviews/service";
import { notifyTaskEdited, notifyTaskDeleted, notifyTaskStatusChanged } from "@/lib/notifications";

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamId = (session.user as any).teamId as string;
  const body = await req.json().catch(() => ({}));

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
    if (data.categoryId) {
      const category = await prisma.category.findFirst({ where: { id: data.categoryId, teamId } });
      if (!category) return NextResponse.json({ error: "Invalid categoryId" }, { status: 400 });
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

    // Moving an OVERDUE task's date/due time into the future makes it not
    // overdue any more. The overdue sweep only ever flips tasks *to* OVERDUE,
    // so without this an edited deadline left the task stuck in that column.
    if (existing.status === "OVERDUE") {
      const nextDate = (instanceData.date as Date | undefined) ?? existing.date;
      const nextDue = data.dueTime !== undefined ? data.dueTime || null : existing.dueTime;
      const stillOverdue = nextDue ? combineDateAndTime(nextDate, nextDue, await getTeamTimezone(teamId)).getTime() < Date.now() : false;
      if (!stillOverdue) instanceData.status = "UPCOMING";
    }

    const task = await prisma.task.update({
      where: { id: params.id },
      data: instanceData,
      include: { client: true, assignedUser: true },
    });
    await notifyTaskEdited(teamId, task, session.user.name ?? "Someone");

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

  const quick = taskQuickUpdateSchema.safeParse(body);
  if (!quick.success) {
    return NextResponse.json({ error: quick.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const q = quick.data;

  if (q.assignedUserId) {
    const assignee = await prisma.user.findFirst({ where: { id: q.assignedUserId, teamId } });
    if (!assignee) return NextResponse.json({ error: "Invalid assignedUserId" }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};
  if (q.status && q.status !== existing.status) {
    updateData.status = q.status;
    if (q.status === "COMPLETED") {
      updateData.completedAt = new Date();
      updateData.completedBy = userId;
    } else if (existing.status === "COMPLETED") {
      // Re-opening a completed task — clear the completion stamp so reports
      // and history don't count it as done.
      updateData.completedAt = null;
      updateData.completedBy = null;
    }
    // Leaving BLOCKED always drops the stale reason, whichever UI did it.
    if (q.status !== "BLOCKED") updateData.blockedReason = null;
  }
  if (q.blockedReason !== undefined && (q.status ?? existing.status) === "BLOCKED") {
    updateData.blockedReason = q.blockedReason || null;
  }
  if (q.assignedUserId !== undefined) updateData.assignedUserId = q.assignedUserId || null;
  if (q.priority) updateData.priority = q.priority;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ task: existing });
  }

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
  // Review pipeline tasks move their guest's stay forward when completed.
  if (q.status === "COMPLETED") await onStayTaskCompleted(teamId, existing.sourceRef, userId);
  if (q.status === "IN_PROGRESS" || q.status === "COMPLETED" || q.status === "BLOCKED") {
    await notifyTaskStatusChanged(teamId, task, q.status, actorName);
  } else {
    await notifyTaskEdited(teamId, task, actorName);
  }

  return NextResponse.json({ task });
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamId = (session.user as any).teamId as string;
  const userId = (session.user as any).id as string;
  const existing = await prisma.task.findFirst({ where: { id: params.id, teamId, deletedAt: null } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // ?series=true stops a recurring series: soft-deletes its template so no
  // more instances are generated. Today's instance (and all past ones) stay
  // as they are. Templates are never shown on the board, so before this
  // there was no way to stop a series that wasn't attached to a client.
  if (new URL(req.url).searchParams.get("series") === "true") {
    const templateId = existing.isRecurringTemplate ? existing.id : existing.recurringTemplateId;
    if (!templateId) return NextResponse.json({ error: "This task is not part of a recurring series" }, { status: 400 });
    const stopped = await prisma.task.updateMany({
      where: { id: templateId, teamId, isRecurringTemplate: true, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy: userId },
    });
    if (stopped.count === 0) return NextResponse.json({ error: "This series has already been stopped" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  // Soft delete — see the Task.deletedAt comment in schema.prisma. A task
  // with an audit trail (completedAt/completedBy) must stay recoverable.
  const task = await prisma.task.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), deletedBy: userId },
    include: { client: true, assignedUser: true },
  });
  await notifyTaskDeleted(teamId, task, session.user.name ?? "Someone");
  return NextResponse.json({ ok: true });
}
