import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, permissions } from "@/lib/auth";
import { sendTestNotification } from "@/lib/discord";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!permissions.canManageDiscordSettings(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { kind } = await req.json();
  if (!["checkin", "checkout"].includes(kind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }

  const result = await sendTestNotification(kind);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Test failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
