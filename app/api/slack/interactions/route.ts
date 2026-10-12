import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { startOfDayUTC } from "@/lib/time";
import { buildDailyDigestText, isCompleteTaskAction, digestBlocks } from "@/lib/slack-bot";

const MAX_TIMESTAMP_SKEW_SECONDS = 60 * 5;

function isValidSlackRequest(rawBody: string, timestamp: string | null, signature: string | null) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret || !timestamp || !signature) return false;

  // Reject old requests outright — without this, a captured request could
  // be replayed indefinitely even though the HMAC itself never expires.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > MAX_TIMESTAMP_SKEW_SECONDS) return false;

  const expected = "v0=" + crypto.createHmac("sha256", signingSecret).update(`v0:${timestamp}:${rawBody}`).digest("hex");
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}

// Slack's "Interactivity & Shortcuts" Request URL — set in the app's
// config once this route is deployed and reachable. A button click POSTs
// here as application/x-www-form-urlencoded with a `payload` field
// (JSON), not raw JSON like Discord's interactions endpoint.
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const timestamp = req.headers.get("x-slack-request-timestamp");
  const signature = req.headers.get("x-slack-signature");

  if (!isValidSlackRequest(rawBody, timestamp, signature)) {
    return NextResponse.json({ error: "Invalid request signature" }, { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  const payloadRaw = params.get("payload");
  if (!payloadRaw) return NextResponse.json({});

  const payload = JSON.parse(payloadRaw);
  if (payload.type !== "block_actions") return NextResponse.json({});

  const action = payload.actions?.[0];
  if (!action || !isCompleteTaskAction(action.action_id)) return NextResponse.json({});

  const taskId = action.value;
  const task = await prisma.task.findFirst({ where: { id: taskId, deletedAt: null } });
  if (!task) return NextResponse.json({});

  const clickerSlackId: string | undefined = payload.user?.id;
  const clicker = clickerSlackId
    ? await prisma.user.findFirst({ where: { slackUserId: clickerSlackId, teamId: task.teamId } })
    : null;

  if (task.status !== "COMPLETED") {
    await prisma.task.update({
      where: { id: task.id },
      data: { status: "COMPLETED", completedAt: new Date(), completedBy: clicker?.id ?? null },
    });
  }

  // Slack must get a fast 200 to acknowledge the click; the visible message
  // update happens as a separate POST to `response_url` (valid for ~30
  // minutes), Slack's equivalent of Discord's inline type-7 UPDATE_MESSAGE.
  if (task.assignedUserId && payload.response_url) {
    const assignee = await prisma.user.findFirst({ where: { id: task.assignedUserId } });
    const dayTasks = await prisma.task.findMany({
      where: {
        assignedUserId: task.assignedUserId,
        date: startOfDayUTC(task.date),
        isRecurringTemplate: false,
        deletedAt: null,
      },
      include: { client: true },
      orderBy: [{ startTime: "asc" }, { createdAt: "asc" }],
    });
    if (assignee) {
      const text = buildDailyDigestText(assignee, dayTasks);
      await fetch(payload.response_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          replace_original: true,
          text,
          blocks: [{ type: "section", text: { type: "mrkdwn", text } }, ...digestBlocks(dayTasks)],
        }),
      }).catch(() => {});
    }
  }

  return NextResponse.json({});
}
