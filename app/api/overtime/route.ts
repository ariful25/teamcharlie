import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserOrNull } from "@/lib/session";
import { createOvertimeRequest } from "@/lib/services/overtime";
import { overtimeCreateSchema } from "@/lib/validations";
import { attendanceErrorResponse } from "@/lib/attendance/http";

// Employee overtime request, or a lead/admin assigning (pre-approving)
// overtime for someone — docs/attendance-rules.md, rule 7.
export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUserOrNull();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = overtimeCreateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const request = await createOvertimeRequest(
      { id: currentUser.id, name: currentUser.name, role: currentUser.role, teamId: currentUser.teamId },
      parsed.data
    );
    return NextResponse.json({ request });
  } catch (err) {
    return attendanceErrorResponse(err, "Could not save the overtime request.");
  }
}
