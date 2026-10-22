import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserOrNull } from "@/lib/session";
import { permissions } from "@/lib/auth";
import { cancelOvertime, reviewOvertime } from "@/lib/services/overtime";
import { overtimeReviewSchema } from "@/lib/validations";
import { attendanceErrorResponse } from "@/lib/attendance/http";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const currentUser = await getCurrentUserOrNull();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!permissions.canEditAttendance(currentUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = overtimeReviewSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const request = await reviewOvertime(
      { id: currentUser.id, name: currentUser.name, role: currentUser.role, teamId: currentUser.teamId },
      params.id,
      parsed.data
    );
    return NextResponse.json({ request });
  } catch (err) {
    return attendanceErrorResponse(err, "Could not save the decision.");
  }
}

// The requester withdrawing their own pending request.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const currentUser = await getCurrentUserOrNull();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await cancelOvertime({ id: currentUser.id, name: currentUser.name, role: currentUser.role, teamId: currentUser.teamId }, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return attendanceErrorResponse(err, "Could not cancel the request.");
  }
}
