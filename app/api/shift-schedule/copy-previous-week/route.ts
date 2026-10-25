import { NextRequest, NextResponse } from "next/server";
import { getTeamTimezone } from "@/lib/team-timezone";
import { parseDayParam } from "@/lib/time";
import { getCurrentUserOrNull } from "@/lib/session";
import { permissions } from "@/lib/auth";
import { copyPreviousWeek } from "@/lib/services/shift-schedule";

export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUserOrNull();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!permissions.canManageShiftSchedule(currentUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { weekStart } = await req.json().catch(() => ({}));
  if (!weekStart) return NextResponse.json({ error: "weekStart is required" }, { status: 400 });

  const result = await copyPreviousWeek(currentUser.teamId, parseDayParam(weekStart, await getTeamTimezone(currentUser.teamId)), currentUser.id);
  return NextResponse.json(result);
}
