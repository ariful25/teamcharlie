import { prisma } from "@/lib/prisma";
import { startOfDayUTC } from "@/lib/time";

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

export async function getAttendanceHistory(userId: string) {
  return prisma.attendanceRecord.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    take: 90,
  });
}
