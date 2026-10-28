import { getScope } from "@/lib/scope";
import { NextRequest, NextResponse } from "next/server";
import { scopeReachesUser, teamOwnsShiftType } from "@/lib/tenancy";
import { getTeamTimezone } from "@/lib/team-timezone";
import { parseDayParam } from "@/lib/time";
import { getCurrentUserOrNull } from "@/lib/session";
import { permissions } from "@/lib/auth";
import { getWeekRoster, assignEmployeeToWeek } from "@/lib/services/shift-schedule";
import { shiftAssignmentCreateSchema } from "@/lib/validations";

export async function GET(req: NextRequest) {
  const currentUser = await getCurrentUserOrNull();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const scope = await getScope(currentUser);

  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");
  const anyDateInWeek = dateParam ? parseDayParam(dateParam, await getTeamTimezone(currentUser.teamId)) : new Date();

  const roster = await getWeekRoster(scope, anyDateInWeek);
  return NextResponse.json(roster);
}

export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUserOrNull();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!permissions.canManageShiftSchedule(currentUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = shiftAssignmentCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { userId, shiftTypeId, weekStart } = parsed.data;
  const scope = await getScope(currentUser);
  if (!(await scopeReachesUser(scope, userId)) || !(await teamOwnsShiftType(currentUser.teamId, shiftTypeId))) {
    return NextResponse.json({ error: "Invalid employee or shift" }, { status: 400 });
  }
  const tz = await getTeamTimezone(currentUser.teamId);
  const result = await assignEmployeeToWeek(userId, shiftTypeId, parseDayParam(weekStart, tz), currentUser.id, tz);
  return NextResponse.json(result);
}
