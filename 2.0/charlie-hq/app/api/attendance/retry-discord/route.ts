import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, permissions } from "@/lib/auth";
import { retryDiscordSync } from "@/lib/services/attendance";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!permissions.canEditAttendance(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { recordId, kind } = await req.json();
  if (!recordId || !["checkin", "checkout"].includes(kind)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const record = await retryDiscordSync(recordId, kind);
    return NextResponse.json(record);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Retry failed" }, { status: 500 });
  }
}
