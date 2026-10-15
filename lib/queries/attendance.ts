import { prisma } from "@/lib/prisma";
import { startOfDayUTC, combineDateAndTime, minutesLate, startOfWeekMonday } from "@/lib/time";
import { getOrCreateTodayRecord } from "@/lib/services/attendance";
import type { AttendanceRecord } from "@prisma/client";

// Overnight shifts (Evening 17:00-01:00, Backup 19:00-03:00, ...) have a
// scheduledCheckOut time-of-day that's numerically earlier than
// scheduledCheckIn — that means the scheduled checkout instant actually
// falls on the *next* calendar day, not `record.date` itself. Comparing
// against the same-day instant would make every overnight checkout look
// ~24h late.
function scheduledCheckoutInstant(record: Pick<AttendanceRecord, "date" | "scheduledCheckIn" | "scheduledCheckOut">) {
  if (!record.scheduledCheckOut) return null;
  const sameDay = combineDateAndTime(record.date, record.scheduledCheckOut);
  const crossesMidnight = !!record.scheduledCheckIn && record.scheduledCheckOut < record.scheduledCheckIn;
  return crossesMidnight ? new Date(sameDay.getTime() + 24 * 60 * 60 * 1000) : sameDay;
}

// Shared by the monthly and weekly views so "how many late check-ins",
// "how many late checkouts", "how many missed punches" always mean the same
// thing everywhere they're shown.
function summarizeAttendance(records: AttendanceRecord[]) {
  const daysWorked = records.filter((r) => r.actualCheckIn).length;
  const totalMinutes = records.reduce((sum, r) => sum + (r.totalMinutes ?? 0), 0);
  const avgDailyMinutes = daysWorked > 0 ? Math.round(totalMinutes / daysWorked) : 0;

  const lateCheckIns = records.filter((r) => r.actualCheckIn && (r.lateMinutes ?? 0) > 0).length;

  const lateCheckOuts = records.filter((r) => {
    if (!r.actualCheckOut) return false;
    const scheduled = scheduledCheckoutInstant(r);
    if (!scheduled) return false;
    return minutesLate(scheduled, r.actualCheckOut) > 0;
  }).length;

  // A row only exists at all for a scheduled day once something created it
  // (dashboard load, admin overview, or — for seeded/historical data — set
  // up explicitly); among those rows, "missing" means the punch never
  // happened, not that the row itself is absent.
  const missingCheckIns = records.filter((r) => !r.actualCheckIn).length;
  const missingCheckOuts = records.filter((r) => r.actualCheckIn && !r.actualCheckOut).length;

  return { daysWorked, totalMinutes, avgDailyMinutes, lateCheckIns, lateCheckOuts, missingCheckIns, missingCheckOuts };
}

async function getLeaveDayCounts(employeeIds: string[], start: Date, end: Date) {
  const assignments = await prisma.shiftAssignment.findMany({
    where: { userId: { in: employeeIds }, date: { gte: start, lt: end } },
    select: { userId: true, status: true },
  });
  const byUser = new Map<string, { paidLeaveDays: number; unpaidLeaveDays: number; sickLeaveDays: number; weekendDays: number }>();
  for (const id of employeeIds) byUser.set(id, { paidLeaveDays: 0, unpaidLeaveDays: 0, sickLeaveDays: 0, weekendDays: 0 });
  for (const a of assignments) {
    const entry = byUser.get(a.userId);
    if (!entry) continue;
    if (a.status === "PAID_LEAVE") entry.paidLeaveDays++;
    else if (a.status === "UNPAID_LEAVE") entry.unpaidLeaveDays++;
    else if (a.status === "SICK_LEAVE") entry.sickLeaveDays++;
    else if (a.status === "WEEKEND") entry.weekendDays++;
  }
  return byUser;
}

export async function getTodayAttendance(teamId: string) {
  const today = startOfDayUTC(new Date());
  const employees = await prisma.user.findMany({ where: { teamId, active: true }, orderBy: { name: "asc" } });
  const records = await prisma.attendanceRecord.findMany({ where: { date: today, userId: { in: employees.map((e) => e.id) } } });

  return employees.map((emp) => {
    const record = records.find((r) => r.userId === emp.id);
    return { employee: emp, record: record ?? null };
  });
}

export async function getMonthlyAttendance(teamId: string, year: number, month: number) {
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));

  const employees = await prisma.user.findMany({ where: { teamId, active: true }, orderBy: { name: "asc" } });
  const employeeIds = employees.map((e) => e.id);
  const [records, leaveCounts] = await Promise.all([
    prisma.attendanceRecord.findMany({ where: { date: { gte: start, lt: end }, userId: { in: employeeIds } } }),
    getLeaveDayCounts(employeeIds, start, end),
  ]);

  return employees.map((emp) => {
    const empRecords = records.filter((r) => r.userId === emp.id);
    return {
      employee: emp,
      ...summarizeAttendance(empRecords),
      ...(leaveCounts.get(emp.id) ?? { paidLeaveDays: 0, unpaidLeaveDays: 0, sickLeaveDays: 0, weekendDays: 0 }),
    };
  });
}

// Same shape as getMonthlyAttendance but scoped to one Mon-Sun week — powers
// the "weekly hour count" / "how many days late this week" view, since the
// monthly rollup alone can't answer either question.
export async function getWeeklyAttendance(teamId: string, weekStartAnyDate: Date) {
  const start = startOfWeekMonday(weekStartAnyDate);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);

  const employees = await prisma.user.findMany({ where: { teamId, active: true }, orderBy: { name: "asc" } });
  const employeeIds = employees.map((e) => e.id);
  const [records, leaveCounts] = await Promise.all([
    prisma.attendanceRecord.findMany({ where: { date: { gte: start, lt: end }, userId: { in: employeeIds } } }),
    getLeaveDayCounts(employeeIds, start, end),
  ]);

  return {
    weekStart: start,
    weekEnd: new Date(end.getTime() - 24 * 60 * 60 * 1000),
    rows: employees.map((emp) => {
      const empRecords = records.filter((r) => r.userId === emp.id);
      return {
        employee: emp,
        ...summarizeAttendance(empRecords),
        ...(leaveCounts.get(emp.id) ?? { paidLeaveDays: 0, unpaidLeaveDays: 0, sickLeaveDays: 0, weekendDays: 0 }),
      };
    }),
  };
}

// Powers the admin-only team overview (app/(app)/attendance/admin) — unlike
// getTodayAttendance, this also lazily creates today's record for anyone
// scheduled WORKING who hasn't touched check-in at all, so an admin always
// has a real AttendanceRecord row to act on via EditAttendanceModal instead
// of hitting "nothing to edit" for someone who simply never checked in.
export async function getAdminAttendanceOverview(teamId: string) {
  const today = startOfDayUTC(new Date());
  const employees = await prisma.user.findMany({ where: { teamId, active: true }, orderBy: { name: "asc" } });
  const employeeIds = employees.map((e) => e.id);

  const assignments = await prisma.shiftAssignment.findMany({
    where: { date: today, userId: { in: employeeIds } },
    include: { shiftType: true },
  });
  const scheduledIds = new Set(assignments.filter((a) => a.status === "WORKING").map((a) => a.userId));

  let records = await prisma.attendanceRecord.findMany({ where: { date: today, userId: { in: employeeIds } } });
  const missingRecordIds = employeeIds.filter((id) => scheduledIds.has(id) && !records.some((r) => r.userId === id));
  if (missingRecordIds.length > 0) {
    await Promise.all(missingRecordIds.map((id) => getOrCreateTodayRecord(id, new Date())));
    records = await prisma.attendanceRecord.findMany({ where: { date: today, userId: { in: employeeIds } } });
  }

  return employees.map((emp) => {
    const assignment = assignments.find((a) => a.userId === emp.id) ?? null;
    const record = records.find((r) => r.userId === emp.id) ?? null;
    const scheduled = assignment?.status === "WORKING";
    const presence: "WORKING" | "NOT_WORKING" = record?.actualCheckIn && !record?.actualCheckOut ? "WORKING" : "NOT_WORKING";

    let exception: "MISSING_CHECK_IN" | "MISSING_CHECK_OUT" | null = null;
    if (scheduled && !record?.actualCheckIn) {
      exception = "MISSING_CHECK_IN";
    } else if (record?.status === "MISSING_CHECK_OUT") {
      exception = "MISSING_CHECK_OUT";
    }

    return { employee: emp, assignment, record, scheduled, presence, exception };
  });
}

export async function getAttendanceHistory(userId: string) {
  return prisma.attendanceRecord.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    take: 90,
  });
}

// The admin overview's "today only" rows miss a missing-checkout that went
// stale on a *previous* day — getAdminAttendanceOverview only ever queries
// today's date, so once a day passes, a stuck record silently drops off
// that view entirely even though nobody ever corrected it. This surfaces
// every still-open record team-wide, any date, so an admin isn't limited to
// whatever happened today — oldest (most overdue) first.
export async function getUnresolvedAttendance(teamId: string) {
  return prisma.attendanceRecord.findMany({
    where: { user: { teamId }, actualCheckIn: { not: null }, actualCheckOut: null },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { date: "asc" },
  });
}
