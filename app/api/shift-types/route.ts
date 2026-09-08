import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserOrNull } from "@/lib/session";
import { permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { shiftTypeSchema } from "@/lib/validations";

export async function GET() {
  const currentUser = await getCurrentUserOrNull();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const shiftTypes = await prisma.shiftType.findMany({
    where: { teamId: currentUser.teamId },
    orderBy: { startTime: "asc" },
  });
  return NextResponse.json({ shiftTypes });
}

export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUserOrNull();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!permissions.canManageShiftSchedule(currentUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = shiftTypeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const shiftType = await prisma.shiftType.create({
    data: { ...parsed.data, teamId: currentUser.teamId },
  });
  return NextResponse.json({ shiftType });
}
