import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserOrNull } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { pushConfigured } from "@/lib/push/send";

// The browser's PushSubscription.toJSON(). Push services are https only.
const subscription = z.object({
  endpoint: z.string().url().startsWith("https://").max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

// Turn notifications on for this device. An endpoint belongs to one browser
// profile, so if someone else signed in on this phone before, it moves to
// the current user and the previous person stops getting pushes here.
export async function POST(req: NextRequest) {
  const user = await getCurrentUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ error: "Notifications aren't set up on this server yet." }, { status: 503 });
  const parsed = subscription.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  const { endpoint, keys } = parsed.data;
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, userId: user.id, teamId: user.teamId },
    update: { p256dh: keys.p256dh, auth: keys.auth, userId: user.id, teamId: user.teamId },
  });
  return NextResponse.json({ ok: true });
}

// Turn them off for this device (also called on sign-out). Only removes the
// endpoint if it's the caller's own.
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = z.object({ endpoint: z.string().max(1000) }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  await prisma.pushSubscription.deleteMany({ where: { endpoint: parsed.data.endpoint, userId: user.id } });
  return NextResponse.json({ ok: true });
}
