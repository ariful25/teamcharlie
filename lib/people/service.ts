import { Prisma, type EmployeeEventKind } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createsManagerLoop, editableFields, profileAccess, type Viewer } from "./access";

// Mutations for employee profiles. Every entry point checks the subject is in
// the actor's team and applies profileAccess(); job-field changes are logged
// as a JOB_CHANGE event so the History tab shows who changed what.

export class PeopleError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

type Actor = Viewer & { teamId: string };

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((s) => new Date(`${s}T00:00:00Z`))
  .nullable();
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => s || null)
    .nullable();
const tags = z.array(z.string().trim().min(1).max(40)).max(20);

export const profileSchema = z
  .object({
    preferredName: text(60),
    bio: text(600),
    skills: tags,
    languages: tags,
    phone: text(30),
    whatsapp: text(30),
    personalEmail: z.string().trim().email().max(120).nullable().or(z.literal("").transform(() => null)),
    dateOfBirth: day,
    address: text(300),
    bloodGroup: z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]).nullable().or(z.literal("").transform(() => null)),
    employeeCode: text(30),
    jobTitle: text(80),
    department: text(60),
    managerId: z.string().nullable(),
    employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"]),
    workLocation: z.enum(["REMOTE", "OFFICE", "HYBRID"]),
    startDate: day,
    probationEndDate: day,
  })
  .partial();

const JOB_LABELS: Record<string, string> = {
  employeeCode: "Employee ID",
  jobTitle: "Job title",
  department: "Department",
  managerId: "Manager",
  employmentType: "Employment type",
  workLocation: "Work location",
  startDate: "Start date",
  probationEndDate: "Probation end",
};

async function subjectInTeam(userId: string, teamId: string) {
  const user = await prisma.user.findFirst({ where: { id: userId, teamId }, include: { profile: true } });
  if (!user) throw new PeopleError("Person not found.", 404);
  return user;
}

function show(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

export async function updateProfile(actor: Actor, userId: string, raw: unknown) {
  const subject = await subjectInTeam(userId, actor.teamId);
  const access = profileAccess(actor, userId);
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) throw new PeopleError(parsed.error.issues[0]?.message ?? "Check the highlighted fields.");

  const allowed = new Set(editableFields(access));
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    if (!allowed.has(k)) throw new PeopleError("You can't change that field.", 403);
    data[k] = v;
  }
  if (Object.keys(data).length === 0) return subject.profile;

  if ("managerId" in data && data.managerId) {
    const managerId = data.managerId as string;
    const manager = await prisma.user.findFirst({ where: { id: managerId, teamId: actor.teamId, active: true } });
    if (!manager) throw new PeopleError("Pick a manager from your team.");
    const profiles = await prisma.employeeProfile.findMany({ where: { user: { teamId: actor.teamId } }, select: { userId: true, managerId: true } });
    const managerOf = new Map(profiles.map((p) => [p.userId, p.managerId]));
    if (createsManagerLoop(userId, managerId, managerOf)) throw new PeopleError("That would make a reporting loop. Someone can't manage their own manager.");
  }

  const before = (subject.profile ?? {}) as Record<string, unknown>;
  const changes = Object.keys(JOB_LABELS)
    .filter((k) => k in data && show(before[k]) !== show(data[k]))
    .map((k) => ({ field: JOB_LABELS[k], key: k, from: show(before[k]), to: show(data[k]) }));

  // Readable manager names in the history instead of ids.
  const ids = changes.filter((c) => c.key === "managerId").flatMap((c) => [c.from, c.to]).filter(Boolean) as string[];
  if (ids.length) {
    const names = new Map((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    for (const c of changes) if (c.key === "managerId") {
      c.from = c.from ? names.get(c.from) ?? c.from : null;
      c.to = c.to ? names.get(c.to) ?? c.to : null;
    }
  }

  return prisma.$transaction(async (tx) => {
    const profile = await tx.employeeProfile.upsert({
      where: { userId },
      create: { ...(data as Omit<Prisma.EmployeeProfileUncheckedCreateInput, "userId">), userId },
      update: data as Prisma.EmployeeProfileUncheckedUpdateInput,
    });
    if (changes.length) {
      await tx.employeeEvent.create({
        data: {
          teamId: actor.teamId,
          userId,
          kind: "JOB_CHANGE",
          title: changes.length === 1 ? `${changes[0].field} updated` : "Job details updated",
          changes: changes.map(({ field, from, to }) => ({ field, from, to })) as Prisma.InputJsonValue,
          actorId: actor.id,
        },
      });
    }
    return profile;
  });
}

const contactSchema = z.object({
  name: z.string().trim().min(1, "Add a name.").max(80),
  relationship: z.string().trim().min(1, "Add the relationship.").max(40),
  phone: z.string().trim().min(5, "Add a phone number.").max(30),
});

export async function addEmergencyContact(actor: Actor, userId: string, raw: unknown) {
  await subjectInTeam(userId, actor.teamId);
  if (!profileAccess(actor, userId).editEmergency) throw new PeopleError("You can't change these contacts.", 403);
  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success) throw new PeopleError(parsed.error.issues[0].message);
  if ((await prisma.emergencyContact.count({ where: { userId } })) >= 5) throw new PeopleError("Five contacts is the limit.");
  return prisma.emergencyContact.create({ data: { userId, ...parsed.data } });
}

export async function deleteEmergencyContact(actor: Actor, userId: string, contactId: string) {
  await subjectInTeam(userId, actor.teamId);
  if (!profileAccess(actor, userId).editEmergency) throw new PeopleError("You can't change these contacts.", 403);
  const r = await prisma.emergencyContact.deleteMany({ where: { id: contactId, userId } });
  if (!r.count) throw new PeopleError("Contact not found.", 404);
}

const documentSchema = z.object({
  title: z.string().trim().min(1, "Add a title.").max(100),
  kind: z.enum(["Contract", "ID", "Certificate", "Policy", "Other"]),
  url: z
    .string()
    .trim()
    .url("Paste a full link (https://…).")
    .refine((u) => /^https:\/\//i.test(u), "Use an https:// link."),
  expiresAt: day.optional(),
});

export async function addDocument(actor: Actor, userId: string, raw: unknown) {
  await subjectInTeam(userId, actor.teamId);
  if (!profileAccess(actor, userId).addDocuments) throw new PeopleError("You can't add documents here.", 403);
  const parsed = documentSchema.safeParse(raw);
  if (!parsed.success) throw new PeopleError(parsed.error.issues[0].message);
  return prisma.employeeDocument.create({ data: { userId, ...parsed.data, expiresAt: parsed.data.expiresAt ?? null, addedById: actor.id } });
}

export async function deleteDocument(actor: Actor, userId: string, documentId: string) {
  await subjectInTeam(userId, actor.teamId);
  const doc = await prisma.employeeDocument.findFirst({ where: { id: documentId, userId } });
  if (!doc) throw new PeopleError("Document not found.", 404);
  if (actor.role !== "ADMIN" && doc.addedById !== actor.id) throw new PeopleError("Only an admin or whoever added it can remove this.", 403);
  await prisma.employeeDocument.delete({ where: { id: doc.id } });
}

const eventSchema = z.object({
  kind: z.enum(["PRAISE", "NOTE", "WARNING"]),
  title: z.string().trim().min(1, "Add a short title.").max(120),
  detail: z.string().trim().max(1000).optional(),
});

export async function addEvent(actor: Actor, userId: string, raw: unknown) {
  await subjectInTeam(userId, actor.teamId);
  const access = profileAccess(actor, userId);
  const parsed = eventSchema.safeParse(raw);
  if (!parsed.success) throw new PeopleError(parsed.error.issues[0].message);
  const kind = parsed.data.kind as EmployeeEventKind;
  if (kind === "PRAISE" ? !access.addPraise : !access.addNoteOrWarning) throw new PeopleError("You can't add that here.", 403);
  return prisma.employeeEvent.create({
    data: {
      teamId: actor.teamId,
      userId,
      kind,
      title: parsed.data.title,
      detail: parsed.data.detail || null,
      private: kind !== "PRAISE",
      actorId: actor.id,
    },
  });
}

export async function deleteEvent(actor: Actor, userId: string, eventId: string) {
  if (actor.role !== "ADMIN") throw new PeopleError("Only admins can remove history entries.", 403);
  const r = await prisma.employeeEvent.deleteMany({ where: { id: eventId, userId, teamId: actor.teamId, kind: { in: ["PRAISE", "NOTE", "WARNING"] } } });
  if (!r.count) throw new PeopleError("Entry not found.", 404);
}
