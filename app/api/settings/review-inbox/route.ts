import { NextResponse } from "next/server";
import { getCurrentUserOrNull } from "@/lib/session";
import { permissions } from "@/lib/auth";
import { disableInbox, inboxStatus, rotateInboxToken } from "@/lib/listing-health/inbox";

async function admin() {
  const user = await getCurrentUserOrNull();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!permissions.canManageNotificationSettings(user.role)) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const a = await admin();
  if (a.error) return a.error;
  return NextResponse.json(await inboxStatus(a.user.teamId));
}

// Creates a new sync token (replacing any old one). Returned once only.
export async function POST() {
  const a = await admin();
  if (a.error) return a.error;
  const token = await rotateInboxToken(a.user.teamId, a.user.id);
  return NextResponse.json({ token });
}

export async function DELETE() {
  const a = await admin();
  if (a.error) return a.error;
  await disableInbox(a.user.teamId);
  return NextResponse.json({ ok: true });
}
