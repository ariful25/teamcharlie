import { prisma } from "@/lib/prisma";
import { getTeamTimezone } from "@/lib/team-timezone";
import { startOfDayUTC } from "@/lib/time";
import { notifyTaskCreated } from "@/lib/notifications";
import { analyzeReviews } from "./reviews";
import { ListingHealthError } from "./service";
import type { Issue } from "./score";

// "Create task" on a Listing Health issue or review complaint theme: turns
// it into a normal Task (client + listing + fix instructions) so it lands in
// the team's existing workflow. Task.sourceRef prevents duplicates while the
// first one is still open.

export const sourceRefFor = (propertyId: string, key: string) => `lh:${propertyId}:${key}`;

/** Best-matching category name per issue code / theme key (team names vary). */
const CATEGORY_HINTS: { match: RegExp; names: string[] }[] = [
  { match: /CLEANLINESS|^cleanliness$|^smell$|^bathroom$|^supplies$/i, names: ["Cleaning", "Operations", "Maintenance"] },
  { match: /maintenance|^wifi$|^pests$|^temperature$|^beds$|^kitchen$|^noise$|MISSING_SAFETY/i, names: ["Maintenance", "Operations"] },
  { match: /CHECKIN|^checkin$|^parking$|COMMUNICATION|^communication$|NO_CHECKIN_INFO/i, names: ["Guest Communication", "Check-in", "Client Communication", "Operations"] },
  { match: /ACCURACY|^accuracy$|PHOTOS|CAPTIONS|TITLE|DESCRIPTION|AMENITIES|NO_RULES|UNREACHABLE/i, names: ["Administrative", "Operations", "Reservation"] },
  { match: /VALUE|^value$/i, names: ["Administrative", "Operations"] },
];

const PRIORITY = { high: "URGENT", medium: "IMPORTANT", low: "NORMAL" } as const;

export async function createFixTask(input: {
  teamId: string;
  actorId: string;
  actorName: string;
  propertyId: string;
  key: string; // issue code or "theme:<key>"
  assignedUserId?: string | null;
}) {
  const property = await prisma.propertyKnowledgeItem.findFirst({ where: { id: input.propertyId, client: { teamId: input.teamId } } });
  if (!property) throw new ListingHealthError("Listing not found.", 404);
  if (input.assignedUserId) {
    const assignee = await prisma.user.findFirst({ where: { id: input.assignedUserId, teamId: input.teamId, active: true } });
    if (!assignee) throw new ListingHealthError("Pick someone on your team.");
  }

  const sourceRef = sourceRefFor(property.id, input.key);
  const open = await prisma.task.findFirst({ where: { teamId: input.teamId, sourceRef, deletedAt: null, status: { not: "COMPLETED" } } });
  if (open) return { task: open, existed: true };

  let title: string;
  let description: string;
  let severity: keyof typeof PRIORITY = "medium";
  if (input.key.startsWith("theme:")) {
    const themeKey = input.key.slice(6);
    const reviews = await prisma.listingReview.findMany({ where: { propertyId: property.id } });
    const theme = analyzeReviews(reviews).find((t) => t.key === themeKey);
    if (!theme) throw new ListingHealthError("That complaint isn't in this listing's reviews any more.");
    title = `${theme.label} complaints`;
    description = [
      `${theme.reviews} review${theme.reviews === 1 ? "" : "s"} complain about ${theme.label.toLowerCase()}:`,
      ...theme.quotes.map((q) => `• "${q.text}" (${q.rating}★)`),
      "",
      `Fix: ${theme.action}`,
    ].join("\n");
    severity = theme.quotes.some((q) => q.rating <= 2) ? "high" : "medium";
  } else {
    const snapshot = await prisma.listingHealthSnapshot.findFirst({ where: { propertyId: property.id }, orderBy: { fetchedAt: "desc" } });
    const issue = ((snapshot?.issues as Issue[] | null) ?? []).find((i) => i.code === input.key);
    if (!issue) throw new ListingHealthError("That issue isn't on the latest health check any more.");
    title = issue.title;
    description = `${issue.detail}\n\nFix: ${issue.action}`;
    severity = issue.severity;
  }

  const hint = CATEGORY_HINTS.find((h) => h.match.test(input.key.replace(/^theme:/, "")));
  const categories = await prisma.category.findMany({ where: { teamId: input.teamId }, select: { id: true, name: true } });
  const category = hint?.names.map((n) => categories.find((c) => c.name.toLowerCase() === n.toLowerCase())).find(Boolean) ?? null;

  const tz = await getTeamTimezone(input.teamId);
  const task = await prisma.task.create({
    data: {
      teamId: input.teamId,
      clientId: property.clientId,
      propertyName: property.internalName,
      categoryId: category?.id ?? null,
      assignedUserId: input.assignedUserId || null,
      title: `${property.internalName}: ${title}`.slice(0, 160),
      description,
      notes: `Created from Listing Health. ${property.airbnbUrl}`,
      date: startOfDayUTC(new Date(), tz),
      priority: PRIORITY[severity],
      status: "UPCOMING",
      sourceRef,
    },
    include: { client: true, assignedUser: true },
  });
  await notifyTaskCreated(input.teamId, task, input.actorName);
  return { task, existed: false };
}
