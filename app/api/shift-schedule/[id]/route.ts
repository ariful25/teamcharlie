import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserOrNull } from "@/lib/session";
import { permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { shiftAssignmentUpdateSchema } from "@/lib/validations";
import { teamOwnsShiftType } from "@/lib/tenancy";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const currentUser = await getCurrentUserOrNull();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!permissions.canManageShiftSchedule(currentUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = shiftAssignmentUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const existing = await prisma.shiftAssignment.findFirst({ where: { id: params.id, user: { teamId: currentUser.teamId } } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await teamOwnsShiftType(currentUser.teamId, parsed.data.shiftTypeId))) {
    return NextResponse.json({ error: "Invalid shiftTypeId" }, { status: 400 });
  }

  const assignment = await prisma.shiftAssignment.update({
    where: { id: params.id },
    data: parsed.data,
  });

  return NextResponse.json({ assignment });
}
