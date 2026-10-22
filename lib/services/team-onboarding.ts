import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// What every brand-new team starts with, so the app is usable on first login
// instead of empty dropdowns. Teams rename/extend these freely afterwards.
// Kept generic — this is no longer only for short-term-rental teams.
// "Follow-up" must stay: the dashboard's Client Follow-ups stat counts it.
export const DEFAULT_CATEGORIES = [
  "Client Communication",
  "Follow-up",
  "Administrative",
  "Operations",
  "Maintenance",
  "Reporting",
  "Attendance",
  "Other",
];

const DEFAULT_SHIFT_TYPES = [
  { name: "Day", startTime: "09:00", endTime: "17:00", colorHex: "#34d399" },
  { name: "Evening", startTime: "17:00", endTime: "01:00", colorHex: "#facc15" },
];

const DEFAULT_CHECKOUT_CHECKLIST = ["Updated all my tasks", "Handed over anything still open"];

export function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "team"
  );
}

async function uniqueSlug(name: string) {
  const base = slugify(name);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const taken = await prisma.team.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export class TeamNameTakenError extends Error {}
export class EmailTakenError extends Error {}

/**
 * Self-service sign-up: one transaction creates the team, its settings, the
 * default categories/shift types/checklist, and the founding ADMIN user.
 */
export async function createTeamWithAdmin(input: {
  teamName: string;
  timezone: string;
  adminName: string;
  email: string;
  password: string;
}) {
  const email = input.email.toLowerCase().trim();
  const teamName = input.teamName.trim();

  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) throw new EmailTakenError();
  // Team.name is @unique — a friendlier error than the raw constraint failure.
  if (await prisma.team.findUnique({ where: { name: teamName }, select: { id: true } })) throw new TeamNameTakenError();

  const slug = await uniqueSlug(teamName);
  const passwordHash = await bcrypt.hash(input.password, 10);

  return prisma.$transaction(async (tx) => {
    const team = await tx.team.create({
      data: { name: teamName, slug, timezone: input.timezone, settings: { create: {} } },
    });
    await tx.category.createMany({ data: DEFAULT_CATEGORIES.map((name) => ({ name, teamId: team.id })) });
    await tx.shiftType.createMany({ data: DEFAULT_SHIFT_TYPES.map((s) => ({ ...s, teamId: team.id })) });
    await tx.checklistItem.createMany({
      data: DEFAULT_CHECKOUT_CHECKLIST.map((label, order) => ({ label, order, teamId: team.id, type: "CHECKOUT" as const })),
    });
    const user = await tx.user.create({
      data: { name: input.adminName.trim(), email, passwordHash, role: "ADMIN", teamId: team.id },
    });
    return { team, user };
  });
}
