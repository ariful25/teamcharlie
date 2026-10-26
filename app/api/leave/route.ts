import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserOrNull } from "@/lib/session";
import { requestLeave } from "@/lib/leave/service";
import { pushLeaveRequested } from "@/lib/push/notify";
import { attendanceErrorResponse } from "@/lib/attendance/http";

const schema = z.object({
  type: z.enum(["PAID", "UNPAID", "SICK"]),
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().max(500),
});

// An employee requesting leave for themselves.
export async function POST(req: NextRequest) {
  const user = await getCurrentUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  try {
    const request = await requestLeave({ id: user.id, name: user.name, role: user.role, teamId: user.teamId }, parsed.data);
    await pushLeaveRequested(user.teamId, request, user);
    return NextResponse.json({ request });
  } catch (err) {
    return attendanceErrorResponse(err, "Could not send the leave request.");
  }
}
