import { PrismaClient, Role, ClientStatus, Priority, TaskStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function startOfWeekMonday(date: Date): Date {
  const dow = date.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  const base = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return new Date(base.getTime() + diffToMonday * 24 * 60 * 60 * 1000);
}

async function main() {
  console.log("Seeding Charlie HQ...");

  // ---- Team ----
  const team = await prisma.team.upsert({
    where: { slug: "charlie" },
    update: {},
    create: {
      name: "Charlie",
      slug: "charlie",
      timezone: "Asia/Dhaka",
      settings: { create: {} },
    },
  });

  // ---- Categories ----
  const categoryNames = [
    "Guest Communication",
    "Check-in",
    "Check-out",
    "Cleaning",
    "Maintenance",
    "Client Communication",
    "Reservation",
    "Tenant / LTR",
    "Follow-up",
    "Administrative",
    "Attendance",
    "Other",
  ];
  const categories: Record<string, string> = {};
  for (const name of categoryNames) {
    const c = await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
    categories[name] = c.id;
  }

  // ---- Shift Types (the team's real shift structure) ----
  const shiftDefs = [
    { name: "Morning", startTime: "08:00", endTime: "17:00", colorHex: "#34d399" },
    { name: "Evening", startTime: "17:00", endTime: "01:00", colorHex: "#facc15" },
    { name: "Night", startTime: "00:00", endTime: "08:00", colorHex: "#818cf8" },
    { name: "Backup", startTime: "19:00", endTime: "03:00", colorHex: "#f472b6" },
  ];
  const shiftTypes: Record<string, string> = {};
  for (const s of shiftDefs) {
    const created = await prisma.shiftType.upsert({
      where: { teamId_name: { teamId: team.id, name: s.name } },
      update: { startTime: s.startTime, endTime: s.endTime, colorHex: s.colorHex },
      create: { ...s, teamId: team.id },
    });
    shiftTypes[s.name] = created.id;
  }

  // ---- Users ----
  const passwordHash = await bcrypt.hash("charliehq123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@strassistance.com" },
    update: {},
    create: {
      name: "Ayesha Rahman",
      email: "admin@strassistance.com",
      passwordHash,
      role: Role.ADMIN,
      teamId: team.id,
      defaultShiftTypeId: shiftTypes["Morning"],
    },
  });

  const lead = await prisma.user.upsert({
    where: { email: "lead@strassistance.com" },
    update: {},
    create: {
      name: "Farhan Hossain",
      email: "lead@strassistance.com",
      passwordHash,
      role: Role.TEAM_LEAD,
      teamId: team.id,
      defaultShiftTypeId: shiftTypes["Morning"],
    },
  });

  const john = await prisma.user.upsert({
    where: { email: "john@strassistance.com" },
    update: {},
    create: {
      name: "John Doe",
      email: "john@strassistance.com",
      passwordHash,
      role: Role.EMPLOYEE,
      teamId: team.id,
      defaultShiftTypeId: shiftTypes["Evening"],
    },
  });

  const sarah = await prisma.user.upsert({
    where: { email: "sarah@strassistance.com" },
    update: {},
    create: {
      name: "Sarah Islam",
      email: "sarah@strassistance.com",
      passwordHash,
      role: Role.EMPLOYEE,
      teamId: team.id,
      defaultShiftTypeId: shiftTypes["Night"],
    },
  });

  // ---- Clients ----
  const andrea = await prisma.client.upsert({
    where: { id: "seed-client-andrea" },
    update: {},
    create: {
      id: "seed-client-andrea",
      name: "Andrea",
      status: ClientStatus.STABLE,
      guestCommunicationPlatform: "Guestly",
      operationPlatform: "ClickUp",
      clientCommunicationPlatform: "WhatsApp",
      teamId: team.id,
    },
  });

  const allen = await prisma.client.upsert({
    where: { id: "seed-client-allen" },
    update: {},
    create: {
      id: "seed-client-allen",
      name: "Allen",
      status: ClientStatus.STABLE,
      guestCommunicationPlatform: "Guestly",
      operationPlatform: "WhatsApp",
      clientCommunicationPlatform: "WhatsApp",
      teamId: team.id,
    },
  });

  const shawn = await prisma.client.upsert({
    where: { id: "seed-client-shawn" },
    update: {},
    create: {
      id: "seed-client-shawn",
      name: "Shawn",
      status: ClientStatus.ATTENTION,
      guestCommunicationPlatform: "Airbnb",
      operationPlatform: "WhatsApp",
      clientCommunicationPlatform: "WhatsApp",
      teamId: team.id,
    },
  });

  const perfectStay = await prisma.client.upsert({
    where: { id: "seed-client-perfectstay" },
    update: {},
    create: {
      id: "seed-client-perfectstay",
      name: "Perfect Stay",
      status: ClientStatus.WAITING,
      notes: "STR + LTR — full workflow pending configuration. Placeholder client only.",
      teamId: team.id,
    },
  });

  const jack = await prisma.client.upsert({
    where: { id: "seed-client-jack" },
    update: {},
    create: {
      id: "seed-client-jack",
      name: "Jack",
      status: ClientStatus.WAITING,
      notes: "Workflow pending configuration.",
      teamId: team.id,
    },
  });

  // ---- Shift Assignments: this week, Mon..Sun, for every employee ----
  const weekStart = startOfWeekMonday(new Date());
  const employeeShift = [
    { user: admin, shiftTypeId: shiftTypes["Morning"] },
    { user: lead, shiftTypeId: shiftTypes["Morning"] },
    { user: john, shiftTypeId: shiftTypes["Evening"] },
    { user: sarah, shiftTypeId: shiftTypes["Night"] },
  ];
  for (let idx = 0; idx < employeeShift.length; idx++) {
    const { user, shiftTypeId } = employeeShift[idx];
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart.getTime() + i * 24 * 60 * 60 * 1000);
      // One weekend day per person, staggered across the week — mirrors the
      // spreadsheet's pattern of everyone getting one day off a week.
      const isWeekendDay = i === (idx + 2) % 7;
      await prisma.shiftAssignment.upsert({
        where: { userId_date: { userId: user.id, date } },
        update: {},
        create: {
          userId: user.id,
          date,
          shiftTypeId,
          status: isWeekendDay ? "WEEKEND" : "WORKING",
          createdBy: admin.id,
        },
      });
    }
  }

  // ---- Tasks (idempotent — keyed by a stable seed id so reseeding never duplicates) ----
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const taskDefs = [
    {
      id: "seed-task-andrea-morning",
      clientId: andrea.id,
      categoryId: categories["Guest Communication"],
      assignedUserId: john.id,
      title: "Andrea — Check overnight guest messages",
      startTime: "07:00",
      dueTime: "08:00",
      priority: Priority.IMPORTANT,
      status: TaskStatus.COMPLETED,
      completedAt: new Date(),
      completedBy: john.id,
      isRecurringTemplate: true,
      repeatMode: "DAILY" as const,
    },
    {
      id: "seed-task-allen-morning",
      clientId: allen.id,
      categoryId: categories["Guest Communication"],
      assignedUserId: sarah.id,
      title: "Allen — Morning guest message review",
      startTime: "07:15",
      dueTime: "08:15",
      priority: Priority.NORMAL,
      status: TaskStatus.COMPLETED,
      completedAt: new Date(),
      completedBy: sarah.id,
      isRecurringTemplate: true,
      repeatMode: "DAILY" as const,
    },
    {
      id: "seed-task-shawn-morning",
      clientId: shawn.id,
      categoryId: categories["Guest Communication"],
      assignedUserId: john.id,
      title: "Shawn — Airbnb inbox review",
      startTime: "07:30",
      dueTime: "08:30",
      priority: Priority.IMPORTANT,
      status: TaskStatus.IN_PROGRESS,
      isRecurringTemplate: true,
      repeatMode: "DAILY" as const,
    },
    {
      id: "seed-task-perfectstay-onboarding",
      clientId: perfectStay.id,
      categoryId: categories["Administrative"],
      assignedUserId: lead.id,
      title: "Perfect Stay — Follow up on onboarding checklist",
      startTime: "10:00",
      dueTime: "11:00",
      priority: Priority.NORMAL,
      status: TaskStatus.UPCOMING,
      isRecurringTemplate: false,
      repeatMode: "NONE" as const,
    },
    {
      id: "seed-task-jack-intro",
      clientId: jack.id,
      categoryId: categories["Client Communication"],
      assignedUserId: sarah.id,
      title: "Jack — Introductory workflow call",
      startTime: "09:00",
      dueTime: "09:30",
      priority: Priority.NORMAL,
      status: TaskStatus.OVERDUE,
      isRecurringTemplate: false,
      repeatMode: "NONE" as const,
    },
  ];

  for (const t of taskDefs) {
    const { id, ...data } = t;
    await prisma.task.upsert({
      where: { id },
      update: {},
      create: { id, ...data, date: today, teamId: team.id },
    });
  }

  console.log("Seed complete.");
  console.log("Login with: admin@strassistance.com / charliehq123 (also lead@ / john@ / sarah@)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
