import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserOrNull } from "@/lib/session";
import { permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { shiftTypeSchema } from "@/lib/validations";

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const currentUser = await getCurrentUserOrNull();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!permissions.canManageShiftSchedule(currentUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = shiftTypeSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const existing = await prisma.shiftType.findFirst({ where: { id: params.id, teamId: currentUser.teamId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const shiftType = await prisma.shiftType.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json({ shiftType });
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const currentUser = await getCurrentUserOrNull();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!permissions.canManageShiftSchedule(currentUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.shiftType.findFirst({ where: { id: params.id, teamId: currentUser.teamId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.shiftType.update({ where: { id: params.id }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
