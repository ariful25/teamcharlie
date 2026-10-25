import { prisma } from "@/lib/prisma";
import { generateRecurringTaskInstances, refreshOverdueTasks } from "@/lib/services/task-generation";
import { autoStopOpenSessions } from "@/lib/services/attendance";
import { advanceStays } from "@/lib/reviews/service";

const TASK_GENERATION_THROTTLE_MS = 5 * 60 * 1000;

/**
 * Throttled per-team upkeep: generate today's recurring task instances, sweep
 * overdue tasks, auto-stop forgotten check-outs. Called from every page that shows
 * tasks (dashboard, /tasks) — previously only the dashboard ran it, so anyone
 * who opened /tasks directly first thing in the morning saw no recurring
 * tasks for today.
 *
 * Claims the throttle slot atomically: the UPDATE's WHERE clause is
 * re-checked against the committed row once any concurrent UPDATE on the
 * same row releases its lock (Postgres "first updater wins"), so of two
 * near-simultaneous page loads at most one sees count === 1. A plain
 * read-then-write let both requests see a stale lastGeneratedAt and both run
 * generation, which is exactly what produced a duplicated day's worth of
 * recurring tasks in testing.
 */
export async function runTeamMaintenance(teamId: string) {
  const claimed = await prisma.team.updateMany({
    where: {
      id: teamId,
      OR: [{ lastGeneratedAt: null }, { lastGeneratedAt: { lt: new Date(Date.now() - TASK_GENERATION_THROTTLE_MS) } }],
    },
    data: { lastGeneratedAt: new Date() },
  });
  if (claimed.count !== 1) return;

  // Independent of each other — different tables, no shared state.
  await Promise.all([
    generateRecurringTaskInstances(teamId),
    refreshOverdueTasks(teamId),
    autoStopOpenSessions({ teamId }),
    // Review pipeline: checkout reached → follow-up task; window closed → expired.
    advanceStays(teamId).catch((err) => console.error("advanceStays", err)),
  ]);
}
