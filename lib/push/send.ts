// Server-side ONLY. Sends Web Push notifications to the phones/browsers a
// user has turned notifications on for (PushSubscription). Best effort like
// lib/notifications.ts: a no-op until the VAPID keys are set, and a failed
// push never fails the request that triggered it.
import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import type { PushMessage } from "./messages";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
// Push services (Apple, Google, Mozilla) see this as the sender's contact:
// the app's own address unless VAPID_SUBJECT names one.
const SUBJECT =
  process.env.VAPID_SUBJECT ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://localhost");

export const pushConfigured = () => !!(PUBLIC_KEY && PRIVATE_KEY);

let ready = false;
function setUp() {
  if (!ready && pushConfigured()) {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY!, PRIVATE_KEY!);
    ready = true;
  }
  return ready;
}

/** Push one message to every device of these users, within one team only. */
export async function pushToUsers(teamId: string, userIds: (string | null | undefined)[], message: PushMessage) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  if (ids.length === 0 || !setUp()) return { sent: 0 };
  try {
    const subs = await prisma.pushSubscription.findMany({
      where: { teamId, userId: { in: ids }, user: { active: true, teamId } },
    });
    const payload = JSON.stringify(message);
    const results = await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 12, urgency: "high" });
          return { id: s.id, ok: true as const };
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          // 404/410: the device unsubscribed or the app was removed.
          return { id: s.id, ok: false as const, gone: status === 404 || status === 410 };
        }
      })
    );
    const gone = results.filter((r) => !r.ok && r.gone).map((r) => r.id);
    const sent = results.filter((r) => r.ok).map((r) => r.id);
    await Promise.all([
      gone.length ? prisma.pushSubscription.deleteMany({ where: { id: { in: gone } } }) : null,
      sent.length ? prisma.pushSubscription.updateMany({ where: { id: { in: sent } }, data: { lastUsedAt: new Date() } }) : null,
    ]);
    return { sent: sent.length };
  } catch (err) {
    console.error("[push] send failed", err);
    return { sent: 0 };
  }
}
