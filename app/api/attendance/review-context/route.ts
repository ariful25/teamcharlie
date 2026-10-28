import { getScope } from "@/lib/scope";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserOrNull } from "@/lib/session";
import { permissions } from "@/lib/auth";
import { getReviewContext } from "@/lib/queries/attendance";

// Shift details, that day's tasks, overtime and audit trail for the review
// dialog. Leads/admins can open anyone on their team; employees only their own.
export async function GET(req: NextRequest) {
  const currentUser = await getCurrentUserOrNull();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const scope = await getScope(currentUser);
  const sp = req.nextUrl.searchParams;
  const context = await getReviewContext(scope, {
    recordId: sp.get("recordId"),
    userId: sp.get("userId"),
    date: sp.get("date"),
  });
  if (!context) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!permissions.canEditAttendance(currentUser.role) && context.shift.userId !== currentUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(context);
}
