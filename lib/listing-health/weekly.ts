import { prisma } from "@/lib/prisma";
import { notifyListingAlerts } from "@/lib/notifications";
import { refreshListingHealth } from "./service";
import type { Issue } from "./score";

// The automatic weekly health check. Called by a daily cron: each run
// re-checks the listings whose last check is ~a week old (oldest first)
// within a time budget, so every listing is refreshed about weekly without
// one run trying to fetch hundreds of pages. Teams are told — once — when a
// rating dropped or a listing page stopped loading.

const STALE_MS = 6.5 * 24 * 60 * 60 * 1000;

export async function runWeeklyChecks(budgetMs = 50_000) {
  const started = Date.now();
  const listings = await prisma.propertyKnowledgeItem.findMany({
    select: {
      id: true,
      internalName: true,
      client: { select: { teamId: true, name: true } },
      healthSnapshots: { orderBy: { fetchedAt: "desc" }, take: 1, select: { fetchedAt: true, ok: true } },
    },
  });
  const due = listings
    .filter((l) => {
      const last = l.healthSnapshots[0];
      // Never-checked listings wait for a person to run the first check —
      // the cron only keeps already-tracked listings fresh.
      return last && Date.now() - last.fetchedAt.getTime() > STALE_MS;
    })
    .sort((a, b) => a.healthSnapshots[0].fetchedAt.getTime() - b.healthSnapshots[0].fetchedAt.getTime());

  const alerts = new Map<string, { snapshotIds: string[]; lines: string[] }>();
  let checked = 0;
  for (const listing of due) {
    if (Date.now() - started > budgetMs) break;
    const wasOk = listing.healthSnapshots[0].ok;
    const { snapshot } = await refreshListingHealth(listing.id, listing.client.teamId, { force: true }).catch(() => ({ snapshot: null }));
    checked++;
    if (!snapshot) continue;
    const issues = (snapshot.issues as Issue[] | null) ?? [];
    const drop = issues.find((i) => i.code === "RATING_DROP");
    let line: string | null = null;
    if (drop) line = `${listing.internalName} (${listing.client.name}): ${drop.title} — now ${snapshot.rating?.toFixed(2)}`;
    else if (!snapshot.ok && wasOk) line = `${listing.internalName} (${listing.client.name}): listing page can't be read any more — snoozed, delisted or URL changed?`;
    if (line) {
      const entry = alerts.get(listing.client.teamId) ?? { snapshotIds: [], lines: [] };
      entry.snapshotIds.push(snapshot.id);
      entry.lines.push(line);
      alerts.set(listing.client.teamId, entry);
    }
  }

  for (const [teamId, entry] of alerts) {
    await notifyListingAlerts(teamId, entry.lines).catch(() => {});
    await prisma.listingHealthSnapshot.updateMany({ where: { id: { in: entry.snapshotIds } }, data: { alertSentAt: new Date() } });
  }
  return { due: due.length, checked, alerts: [...alerts.values()].reduce((s, a) => s + a.lines.length, 0) };
}
