import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, permissions } from "@/lib/auth";
import { retryNotificationSync } from "@/lib/services/attendance";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = session.user.role;
  if (!permissions.canEditAttendance(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // `channel` defaults to "discord" so the pre-existing retry button (which
  // only ever sent {recordId, kind}) keeps working unchanged.
  const { recordId, kind, channel = "discord" } = await req.json().catch(() => ({}));
  if (!recordId || !["checkin", "checkout"].includes(kind) || !["discord", "slack"].includes(channel)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const teamId = session.user.teamId as string;
  const owned = await prisma.attendanceRecord.findFirst({ where: { id: recordId, user: { teamId } }, select: { id: true } });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const record = await retryNotificationSync(recordId, kind, channel);
    return NextResponse.json(record);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Retry failed" }, { status: 500 });
  }
}
