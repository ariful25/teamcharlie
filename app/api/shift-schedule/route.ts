import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserOrNull } from "@/lib/session";
import { permissions } from "@/lib/auth";
import { getWeekRoster, assignEmployeeToWeek } from "@/lib/services/shift-schedule";
import { shiftAssignmentCreateSchema } from "@/lib/validations";

export async function GET(req: NextRequest) {
  const currentUser = await getCurrentUserOrNull();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");
  const anyDateInWeek = dateParam ? new Date(dateParam) : new Date();

  const roster = await getWeekRoster(currentUser.teamId, anyDateInWeek);
  return NextResponse.json(roster);
}

export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUserOrNull();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!permissions.canManageShiftSchedule(currentUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = shiftAssignmentCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { userId, shiftTypeId, weekStart } = parsed.data;
  const result = await assignEmployeeToWeek(userId, shiftTypeId, new Date(weekStart), currentUser.id);
  return NextResponse.json(result);
}
