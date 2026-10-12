import { prisma } from "@/lib/prisma";
import { startOfDayUTC } from "@/lib/time";
import { getOrCreateTodayRecord } from "@/lib/services/attendance";

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
  const records = await prisma.attendanceRecord.findMany({
    where: { date: { gte: start, lt: end }, userId: { in: employees.map((e) => e.id) } },
  });

  return employees.map((emp) => {
    const empRecords = records.filter((r) => r.userId === emp.id);
    const daysWorked = empRecords.filter((r) => r.actualCheckIn).length;
    const totalMinutes = empRecords.reduce((sum, r) => sum + (r.totalMinutes ?? 0), 0);
    const avgDaily = daysWorked > 0 ? Math.round(totalMinutes / daysWorked) : 0;
    const lateDays = empRecords.filter((r) => r.status === "LATE").length;
    const missingCheckouts = empRecords.filter((r) => r.actualCheckIn && !r.actualCheckOut).length;

    return {
      employee: emp,
      daysWorked,
      totalMinutes,
      avgDailyMinutes: avgDaily,
      lateDays,
      missingCheckouts,
    };
  });
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
