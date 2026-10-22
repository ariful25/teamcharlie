import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserOrNull } from "@/lib/session";
import { checkOut } from "@/lib/services/attendance";
import { attendanceErrorResponse } from "@/lib/attendance/http";

export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUserOrNull();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const checklist = Array.isArray(body.checklist) ? body.checklist : undefined;
  try {
    return NextResponse.json(await checkOut(currentUser.id, checklist));
  } catch (err) {
    return attendanceErrorResponse(err, "Could not check out. Please try again.");
  }
}
