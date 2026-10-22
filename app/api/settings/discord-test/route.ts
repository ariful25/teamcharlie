import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, permissions } from "@/lib/auth";
import { sendTestNotification } from "@/lib/discord";
import { getTeamChannels } from "@/lib/notifications";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!permissions.canManageNotificationSettings(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { kind } = await req.json();
  if (!["checkin", "checkout", "team"].includes(kind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }

  // The env webhooks belong to the home team only — any other team tests the
  // webhook saved in its own Settings.
  const channels = await getTeamChannels((session.user as any).teamId as string);
  const url =
    channels.isHomeTeam && kind === "checkin"
      ? process.env.DISCORD_CHECKIN_WEBHOOK_URL
      : channels.isHomeTeam && kind === "checkout"
        ? process.env.DISCORD_CHECKOUT_WEBHOOK_URL
        : channels.webhookUrl;
  const result = await sendTestNotification(kind, url || "");
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Test failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
