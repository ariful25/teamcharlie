import { NextResponse } from "next/server";
import { AttendanceError } from "@/lib/services/attendance";

/** Maps a thrown AttendanceError to its status + readable message; anything
 *  else is logged and returned as a generic 500. */
export function attendanceErrorResponse(err: unknown, fallback: string) {
  if (err instanceof AttendanceError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  }
  console.error(err);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
