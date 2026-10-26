import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserOrNull } from "@/lib/session";
import { permissions } from "@/lib/auth";
import { cancelLeave, reviewLeave } from "@/lib/leave/service";
import { pushLeaveDecided } from "@/lib/push/notify";
import { attendanceErrorResponse } from "@/lib/attendance/http";

const schema = z.object({ action: z.enum(["APPROVE", "REJECT", "REVOKE"]), note: z.string().max(500).optional().nullable() });

// Lead/admin decision (approve writes the leave onto the Shift Schedule).
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!permissions.canEditAttendance(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const request = await reviewLeave({ id: user.id, name: user.name, role: user.role, teamId: user.teamId }, params.id, parsed.data);
    await pushLeaveDecided(user.teamId, request, parsed.data.action, user);
    return NextResponse.json({ request });
  } catch (err) {
    return attendanceErrorResponse(err, "Could not save the decision.");
  }
}

// The employee withdrawing their own pending request.
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await cancelLeave({ id: user.id, name: user.name, role: user.role, teamId: user.teamId }, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return attendanceErrorResponse(err, "Could not cancel.");
  }
}
