import { NextRequest, NextResponse } from "next/server";
import nacl from "tweetnacl";
import { prisma } from "@/lib/prisma";
import { startOfDayUTC } from "@/lib/time";
import { buildDailyDigestContent, isCompleteTaskCustomId, taskIdFromCustomId, digestComponents } from "@/lib/discord-bot";

// Discord's "Interactions Endpoint URL" — set in the Developer Portal once
// this route is deployed and reachable (Discord verifies it with a PING
// before saving it). No gateway connection needed: Discord POSTs here
// directly for every button click, this responds synchronously, done.
export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  const rawBody = await req.text();

  if (!signature || !timestamp || !publicKey) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  const isValid = nacl.sign.detached.verify(
    Buffer.from(timestamp + rawBody),
    Buffer.from(signature, "hex"),
    Buffer.from(publicKey, "hex")
  );
  if (!isValid) {
    return NextResponse.json({ error: "Invalid request signature" }, { status: 401 });
  }

  const interaction = JSON.parse(rawBody);

  // PING — Discord sends this once when you save the endpoint URL.
  if (interaction.type === 1) {
    return NextResponse.json({ type: 1 });
  }

  // MESSAGE_COMPONENT — a button click.
  if (interaction.type === 3) {
    const customId = interaction.data?.custom_id ?? "";
    if (!isCompleteTaskCustomId(customId)) {
      return NextResponse.json({ type: 6 }); // acknowledge, no-op on anything we don't recognize
    }

    const taskId = taskIdFromCustomId(customId);
    const task = await prisma.task.findFirst({ where: { id: taskId, deletedAt: null } });
    if (!task) {
      return NextResponse.json({ type: 6 });
    }

    const clickerDiscordId: string | undefined = interaction.member?.user?.id ?? interaction.user?.id;
    const clicker = clickerDiscordId
      ? await prisma.user.findFirst({ where: { discordUserId: clickerDiscordId, teamId: task.teamId } })
      : null;

    if (task.status !== "COMPLETED") {
      await prisma.task.update({
        where: { id: task.id },
        data: { status: "COMPLETED", completedAt: new Date(), completedBy: clicker?.id ?? null },
      });
    }

    // Re-render the whole digest from current DB state rather than trying
    // to patch just this one line — simplest way to keep the message
    // consistent if multiple buttons get clicked close together.
    if (task.assignedUserId) {
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
        return NextResponse.json({
          type: 7, // UPDATE_MESSAGE
          data: {
            content: buildDailyDigestContent(assignee, dayTasks),
            components: digestComponents(dayTasks),
          },
        });
      }
    }

    return NextResponse.json({ type: 6 });
  }

  return NextResponse.json({ type: 6 });
}
