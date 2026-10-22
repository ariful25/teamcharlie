import { NextResponse } from "next/server";
import { getCurrentUserOrNull } from "@/lib/session";
import { checkIn } from "@/lib/services/attendance";
import { attendanceErrorResponse } from "@/lib/attendance/http";

export async function POST() {
  const currentUser = await getCurrentUserOrNull();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await checkIn(currentUser.id));
  } catch (err) {
    return attendanceErrorResponse(err, "Could not check in. Please try again.");
  }
}
