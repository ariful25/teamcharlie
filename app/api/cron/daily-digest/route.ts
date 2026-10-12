import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfDayUTC } from "@/lib/time";
import { generateRecurringTaskInstances, refreshOverdueTasks } from "@/lib/services/task-generation";
import { notifyDailyDigest } from "@/lib/notifications";

// Vercel Cron (see vercel.json) hits this once a day at the team's local
// midnight. It automatically sends `Authorization: Bearer ${CRON_SECRET}`
// when a CRON_SECRET env var is set on the project — this route refuses to
// run without that header matching, so the endpoint can't be triggered by
// anyone who finds the URL.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const teams = await prisma.team.findMany({ select: { id: true } });
  const today = startOfDayUTC(new Date());
  let digestsSent = 0;

  for (const team of teams) {
    // Make sure today's recurring instances already exist and nothing
    // stale is sitting as UPCOMING/IN_PROGRESS past its due time — this
    // cron is now the reliable trigger for both, independent of whether
    // anyone has loaded the Dashboard yet today.
    await generateRecurringTaskInstances(team.id);
    await refreshOverdueTasks(team.id);

    const tasks = await prisma.task.findMany({
      where: {
        teamId: team.id,
        date: today,
        isRecurringTemplate: false,
        deletedAt: null,
        assignedUserId: { not: null },
      },
      include: { client: true, assignedUser: true },
      orderBy: [{ startTime: "asc" }, { createdAt: "asc" }],
    });

    const byAssignee = new Map<string, typeof tasks>();
    for (const task of tasks) {
      if (!task.assignedUserId) continue;
      byAssignee.set(task.assignedUserId, [...(byAssignee.get(task.assignedUserId) ?? []), task]);
    }

    for (const [, userTasks] of byAssignee) {
      const assignee = userTasks[0].assignedUser;
      if (!assignee) continue;
      await notifyDailyDigest(assignee, userTasks);
      digestsSent++;
    }
  }

  return NextResponse.json({ ok: true, digestsSent });
}
