import { prisma } from "@/lib/prisma";
import { getTeamTimezone } from "@/lib/team-timezone";
import { startOfDayUTC } from "@/lib/time";
import { getPeriodSummary, getTeamDay, monthRange } from "@/lib/queries/attendance";
import { leaveBalances } from "@/lib/leave/service";
import { daysUntilBirthday, profileAccess, tenure, type Viewer } from "./access";

// Read models for the People pages. Fields the viewer may not see are left
// out here, server-side — never sent and hidden in the browser.

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

export type PersonCard = {
  id: string;
  name: string;
  preferredName: string | null;
  email: string;
  role: string;
  jobTitle: string | null;
  department: string | null;
  managerId: string | null;
  workLocation: string;
  phone: string | null;
  tenure: string | null;
  presence: "working" | "scheduled" | "leave" | "off";
  birthdayInDays: number | null;
  completeness: number;
};

/** How much of the profile is filled in (0–100) — nudges people to finish theirs. */
function completenessOf(p: Record<string, unknown> | null) {
  if (!p) return 0;
  const keys = ["jobTitle", "department", "managerId", "startDate", "phone", "bio", "dateOfBirth", "address", "bloodGroup"];
  const filled = keys.filter((k) => {
    const v = p[k];
    return v !== null && v !== undefined && v !== "";
  }).length + ((p.skills as string[] | undefined)?.length ? 1 : 0);
  return Math.round((filled / (keys.length + 1)) * 100);
}

export async function getDirectory(teamId: string) {
  const tz = await getTeamTimezone(teamId);
  const today = startOfDayUTC(new Date(), tz);
  const [users, day] = await Promise.all([
    prisma.user.findMany({ where: { teamId, active: true }, include: { profile: true }, orderBy: { name: "asc" } }),
    getTeamDay(teamId, today),
  ]);
  const stateOf = new Map<string, string>(day.rows.map((r) => [r.userId, r.state]));
  const people: PersonCard[] = users.map((u) => {
    const p = u.profile;
    const state = stateOf.get(u.id);
    return {
      id: u.id,
      name: u.name,
      preferredName: p?.preferredName ?? null,
      email: u.email,
      role: u.role,
      jobTitle: p?.jobTitle ?? null,
      department: p?.department ?? null,
      managerId: p?.managerId ?? null,
      workLocation: p?.workLocation ?? "REMOTE",
      phone: p?.phone ?? null,
      tenure: p?.startDate ? tenure(p.startDate, today) : null,
      presence: state === "WORKING" ? "working" : state === "LEAVE" ? "leave" : state && !["OFF", "DONE", "ABSENT"].includes(state) ? "scheduled" : "off",
      birthdayInDays: p?.dateOfBirth ? daysUntilBirthday(p.dateOfBirth, today) : null,
      completeness: completenessOf(p as unknown as Record<string, unknown>),
    };
  });
  const departments = Array.from(new Set(people.map((p) => p.department).filter(Boolean) as string[])).sort();
  return { people, departments };
}

export async function getProfile(viewer: Viewer & { teamId: string }, userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, teamId: viewer.teamId },
    include: {
      profile: { include: { manager: { select: { id: true, name: true } } } },
      directReports: { where: { user: { active: true } }, select: { user: { select: { id: true, name: true } } } },
      salary: true,
    },
  });
  if (!user) return null;
  const access = profileAccess(viewer, userId);
  const tz = await getTeamTimezone(viewer.teamId);
  const today = startOfDayUTC(new Date(), tz);
  const { start, end } = monthRange(today.getUTCFullYear(), today.getUTCMonth());
  const shiftType = user.defaultShiftTypeId ? await prisma.shiftType.findFirst({ where: { id: user.defaultShiftTypeId, teamId: viewer.teamId } }) : null;

  const [month, leave, contacts, documents, events, teammates] = await Promise.all([
    access.viewTime ? getPeriodSummary(viewer.teamId, start, end, userId).then((r) => r[0] ?? null) : Promise.resolve(null),
    access.viewPersonal ? leaveBalances(userId, viewer.teamId, today.getUTCFullYear()) : Promise.resolve(null),
    access.viewEmergency ? prisma.emergencyContact.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }) : Promise.resolve([]),
    access.viewDocuments ? prisma.employeeDocument.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }) : Promise.resolve([]),
    prisma.employeeEvent.findMany({
      where: { userId, teamId: viewer.teamId, ...(access.viewPrivateEvents ? {} : { private: false }) },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    access.editJob ? prisma.user.findMany({ where: { teamId: viewer.teamId, active: true, id: { not: userId } }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);
  const actorIds = Array.from(new Set(events.map((e) => e.actorId)));
  const actors = new Map((await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const p = user.profile;

  return {
    access,
    today: iso(today)!,
    person: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
      joinedApp: iso(user.createdAt)!,
      defaultShift: shiftType ? `${shiftType.name} · ${shiftType.startTime} to ${shiftType.endTime}` : null,
    },
    job: {
      employeeCode: p?.employeeCode ?? null,
      jobTitle: p?.jobTitle ?? null,
      department: p?.department ?? null,
      manager: p?.manager ?? null,
      employmentType: p?.employmentType ?? "FULL_TIME",
      workLocation: p?.workLocation ?? "REMOTE",
      startDate: iso(p?.startDate),
      probationEndDate: iso(p?.probationEndDate),
      tenure: p?.startDate ? tenure(p.startDate, today) : null,
      reports: user.directReports.map((r) => r.user),
    },
    about: {
      preferredName: p?.preferredName ?? null,
      bio: p?.bio ?? null,
      skills: p?.skills ?? [],
      languages: p?.languages ?? [],
      phone: p?.phone ?? null,
      whatsapp: p?.whatsapp ?? null,
    },
    personal: access.viewPersonal
      ? {
          personalEmail: p?.personalEmail ?? null,
          dateOfBirth: iso(p?.dateOfBirth),
          address: p?.address ?? null,
          bloodGroup: p?.bloodGroup ?? null,
          birthdayInDays: p?.dateOfBirth ? daysUntilBirthday(p.dateOfBirth, today) : null,
        }
      : null,
    contacts: contacts.map((c) => ({ id: c.id, name: c.name, relationship: c.relationship, phone: c.phone })),
    documents: documents.map((d) => ({
      id: d.id,
      title: d.title,
      kind: d.kind,
      url: d.url,
      expiresAt: iso(d.expiresAt),
      canDelete: viewer.role === "ADMIN" || d.addedById === viewer.id,
    })),
    events: events.map((e) => ({
      id: e.id,
      kind: e.kind,
      title: e.title,
      detail: e.detail,
      changes: (e.changes as { field: string; from: string | null; to: string | null }[] | null) ?? null,
      private: e.private,
      by: actors.get(e.actorId) ?? "Someone",
      at: e.createdAt.toISOString(),
    })),
    month,
    leave,
    pay: access.viewPay && user.salary ? { monthlyGross: user.salary.monthlyGross, basicPercent: user.salary.basicPercent } : null,
    teammates,
    completeness: completenessOf(p as unknown as Record<string, unknown>),
  };
}

export type ProfileData = NonNullable<Awaited<ReturnType<typeof getProfile>>>;
