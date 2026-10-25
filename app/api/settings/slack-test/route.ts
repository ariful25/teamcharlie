import { NextRequest, NextResponse } from "next/server";
import { getTeamChannels } from "@/lib/notifications";
import { getServerSession } from "next-auth";
import { authOptions, permissions } from "@/lib/auth";
import { sendTestNotification } from "@/lib/slack-bot";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!permissions.canManageNotificationSettings(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { kind } = await req.json().catch(() => ({}));
  if (!["checkin", "checkout"].includes(kind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }

  // Slack is wired to the deployment's single Slack app, which only the home
  // team uses — see lib/notifications.ts.
  if (!(await getTeamChannels((session.user as any).teamId as string)).isHomeTeam) {
    return NextResponse.json({ error: "Slack isn't available for this team yet — use a Discord webhook instead." }, { status: 400 });
  }

  const result = await sendTestNotification(kind);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Test failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
