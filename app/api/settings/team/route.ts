import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserOrNull } from "@/lib/session";
import { permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { teamSettingsSchema } from "@/lib/validations";

// Team profile (name, timezone) and the team's own Discord webhook. The
// webhook URL is write-only from the browser's point of view: responses only
// ever say whether one is set.
export async function PATCH(req: NextRequest) {
  const currentUser = await getCurrentUserOrNull();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!permissions.canManageNotificationSettings(currentUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = teamSettingsSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { name, timezone, discordWebhookUrl, autoCheckoutHours } = parsed.data;

  if (name) {
    const clash = await prisma.team.findFirst({ where: { name, NOT: { id: currentUser.teamId } }, select: { id: true } });
    if (clash) return NextResponse.json({ error: "Another team already uses that name." }, { status: 409 });
  }

  const team = await prisma.team.update({
    where: { id: currentUser.teamId },
    data: { ...(name ? { name } : {}), ...(timezone ? { timezone } : {}) },
    select: { name: true, timezone: true },
  });

  if (autoCheckoutHours !== undefined) {
    await prisma.teamSettings.upsert({
      where: { teamId: currentUser.teamId },
      update: { autoCheckoutHours },
      create: { teamId: currentUser.teamId, autoCheckoutHours },
    });
  }

  let webhookConfigured: boolean | undefined;
  if (discordWebhookUrl !== undefined) {
    const value = discordWebhookUrl || null;
    const settings = await prisma.teamSettings.upsert({
      where: { teamId: currentUser.teamId },
      update: { discordWebhookUrl: value },
      create: { teamId: currentUser.teamId, discordWebhookUrl: value },
      select: { discordWebhookUrl: true },
    });
    webhookConfigured = !!settings.discordWebhookUrl;
  }

  return NextResponse.json({ team, webhookConfigured });
}
