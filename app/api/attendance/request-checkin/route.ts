import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserOrNull } from "@/lib/session";
import { requestCheckIn } from "@/lib/services/attendance";
import { attendanceErrorResponse } from "@/lib/attendance/http";

// Blocked by an unresolved shift: records the time the employee tried to
// start, for a team lead to approve (docs/attendance-rules.md, conflict #5).
export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUserOrNull();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  try {
    const note = typeof body.note === "string" ? body.note.slice(0, 500) : undefined;
    return NextResponse.json(await requestCheckIn(currentUser.id, note));
  } catch (err) {
    return attendanceErrorResponse(err, "Could not send the request. Please try again.");
  }
}
