import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserOrNull } from "@/lib/session";
import { submitClaim } from "@/lib/services/attendance";
import { attendanceClaimSchema } from "@/lib/validations";
import { attendanceErrorResponse } from "@/lib/attendance/http";

// Employee's own correction claim for a missed punch — always reviewed.
export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUserOrNull();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = attendanceClaimSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    return NextResponse.json(await submitClaim(currentUser.id, parsed.data));
  } catch (err) {
    return attendanceErrorResponse(err, "Could not submit the correction. Please try again.");
  }
}
