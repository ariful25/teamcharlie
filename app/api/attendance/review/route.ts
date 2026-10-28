import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserOrNull } from "@/lib/session";
import { permissions } from "@/lib/auth";
import { reviewRecord } from "@/lib/services/attendance";
import { attendanceReviewSchema } from "@/lib/validations";
import { attendanceErrorResponse } from "@/lib/attendance/http";

// Team lead / admin decision on a shift. Self-approval rules live in
// reviewRecord (lib/attendance/rules.ts canReview).
export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUserOrNull();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!permissions.canEditAttendance(currentUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = attendanceReviewSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const record = await reviewRecord(
      { id: currentUser.id, name: currentUser.name, role: currentUser.role, teamId: currentUser.teamId, squadId: currentUser.squadId },
      parsed.data
    );
    return NextResponse.json({ record });
  } catch (err) {
    return attendanceErrorResponse(err, "Could not save the decision. Please try again.");
  }
}
