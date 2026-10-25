import { prisma } from "@/lib/prisma";

// The admin's "finish setting up" list on the dashboard. Each item is real
// data, not a dismissible tip: it disappears once the work is done.

export type SetupItem = { key: string; title: string; detail: string; href: string; done: number; total: number };

export async function getSetupChecklist(teamId: string): Promise<SetupItem[]> {
  const [people, salaries, profiles, settings, listings, delisted] = await Promise.all([
    prisma.user.count({ where: { teamId, active: true } }),
    prisma.employeeSalary.count({ where: { user: { teamId, active: true } } }),
    prisma.employeeProfile.count({ where: { user: { teamId, active: true }, jobTitle: { not: null } } }),
    prisma.teamSettings.findUnique({ where: { teamId }, select: { reviewInboxTokenHash: true, aiEnabled: true } }),
    prisma.propertyKnowledgeItem.count({ where: { client: { teamId } } }),
    prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM (
        SELECT DISTINCT ON (s."propertyId") s.issues
        FROM "ListingHealthSnapshot" s
        JOIN "PropertyKnowledgeItem" k ON k.id = s."propertyId"
        JOIN "Client" c ON c.id = k."clientId"
        WHERE c."teamId" = ${teamId}
        ORDER BY s."propertyId", s."fetchedAt" DESC
      ) latest
      WHERE latest.issues::text LIKE '%"DELISTED"%'`,
  ]);
  const gone = Number(delisted[0]?.n ?? 0);

  const items: SetupItem[] = [
    { key: "salaries", title: "Add salaries", detail: "Payroll can't run without them.", href: "/payroll", done: salaries, total: people },
    { key: "profiles", title: "Fill in job titles", detail: "The org chart and People directory build from them.", href: "/people", done: profiles, total: people },
    {
      key: "email-sync",
      title: "Turn on Airbnb email sync",
      detail: "Starts the Reviews pipeline: follow-ups, review requests and replies.",
      href: "/settings?section=reviews",
      done: settings?.reviewInboxTokenHash ? 1 : 0,
      total: 1,
    },
    { key: "ai", title: "Connect AI", detail: "Drafts review replies, listing copy and check-in guides.", href: "/settings?section=ai", done: settings?.aiEnabled ? 1 : 0, total: 1 },
    { key: "delisted", title: "Fix listings that left Airbnb", detail: "Update their URL or delete them in the Knowledge Base.", href: "/listing-health", done: listings - gone, total: listings },
  ];
  return items.filter((i) => i.total > 0 && i.done < i.total);
}
