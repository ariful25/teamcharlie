import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserOrNull } from "@/lib/session";
import { permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checklistItemUpdateSchema } from "@/lib/validations";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const currentUser = await getCurrentUserOrNull();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!permissions.canManageChecklists(currentUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.checklistItem.findFirst({ where: { id: params.id, teamId: currentUser.teamId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = checklistItemUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const item = await prisma.checklistItem.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json({ item });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const currentUser = await getCurrentUserOrNull();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!permissions.canManageChecklists(currentUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.checklistItem.findFirst({ where: { id: params.id, teamId: currentUser.teamId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Hard delete — nothing references this row. A past checkout's answers
  // live on AttendanceRecord.checkoutChecklist as a snapshot, not a
  // relation, so removing the item here never touches history.
  await prisma.checklistItem.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
