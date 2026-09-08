import { prisma } from "@/lib/prisma";
import { startOfDayUTC, combineDateAndTime, minutesLate } from "@/lib/time";
import { sendCheckInNotification, sendCheckOutNotification } from "@/lib/discord";

/**
 * The Shift Schedule (ShiftAssignment) is the single source of truth for "who is
 * expected to work when." A day marked WEEKEND/LEAVE, or with no assignment at all,
 * has no scheduled time — the employee can still check in manually, we just won't
 * compute a "late" status against nothing.
 */
export async function getOrCreateTodayRecord(userId: string, referenceDate: Date = new Date()) {
  const today = startOfDayUTC(referenceDate);

  let record = await prisma.attendanceRecord.findUnique({
    where: { userId_date: { userId, date: today } },
  });

  if (!record) {
    const assignment = await prisma.shiftAssignment.findUnique({
      where: { userId_date: { userId, date: today } },
      include: { shiftType: true },
    });

    const isWorkingDay = assignment?.status === "WORKING";
    const scheduledCheckIn = isWorkingDay
      ? assignment?.customStart ?? assignment?.shiftType?.startTime ?? null
      : null;
    const scheduledCheckOut = isWorkingDay
      ? assignment?.customEnd ?? assignment?.shiftType?.endTime ?? null
      : null;

    record = await prisma.attendanceRecord.create({
      data: {
        userId,
        date: today,
        scheduledCheckIn,
        scheduledCheckOut,
        status: "MISSING_CHECK_IN",
      },
    });
  }

  return record;
}

export async function checkIn(userId: string) {
  const now = new Date();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { team: true } });
  const record = await getOrCreateTodayRecord(userId, now);

  if (record.actualCheckIn) {
    throw new Error("ALREADY_CHECKED_IN");
  }

  let isLate = false;
  let lateMinutes = 0;
  if (record.scheduledCheckIn) {
    const scheduledDate = combineDateAndTime(record.date, record.scheduledCheckIn);
    lateMinutes = minutesLate(scheduledDate, now);
    isLate = lateMinutes > 0;
  }

  const updated = await prisma.attendanceRecord.update({
    where: { id: record.id },
    data: {
      actualCheckIn: now,
      lateMinutes: isLate ? lateMinutes : 0,
      status: isLate ? "LATE" : "ON_TIME",
    },
  });

  // 1. DB write already committed above. 2. Attempt Discord — never let a
  // Discord outage roll back or block the attendance record.
  const discordResult = await sendCheckInNotification({
    employeeName: user.name,
    teamName: user.team.name,
    date: record.date,
    actualCheckIn: now,
    scheduledCheckIn: record.scheduledCheckIn,
    isLate,
    lateMinutes,
  });

  const final = await prisma.attendanceRecord.update({
    where: { id: record.id },
    data: {
      discordCheckInSynced: discordResult.ok,
      discordCheckInError: discordResult.ok ? null : discordResult.error,
    },
  });

  return final;
}

export async function checkOut(userId: string) {
  const now = new Date();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { team: true } });
  const record = await getOrCreateTodayRecord(userId, now);

  if (!record.actualCheckIn) {
    throw new Error("NOT_CHECKED_IN");
  }
  if (record.actualCheckOut) {
    throw new Error("ALREADY_CHECKED_OUT");
  }

  const totalMinutes = Math.round((now.getTime() - record.actualCheckIn.getTime()) / 60000);

  const updated = await prisma.attendanceRecord.update({
    where: { id: record.id },
    data: {
      actualCheckOut: now,
      totalMinutes,
      status: "CHECKED_OUT",
    },
  });

  const discordResult = await sendCheckOutNotification({
    employeeName: user.name,
    teamName: user.team.name,
    date: record.date,
    actualCheckIn: record.actualCheckIn,
    actualCheckOut: now,
    totalMinutes,
  });

  const final = await prisma.attendanceRecord.update({
    where: { id: record.id },
    data: {
      discordCheckOutSynced: discordResult.ok,
      discordCheckOutError: discordResult.ok ? null : discordResult.error,
    },
  });

  return final;
}

export async function retryDiscordSync(recordId: string, kind: "checkin" | "checkout") {
  const record = await prisma.attendanceRecord.findUniqueOrThrow({
    where: { id: recordId },
    include: { user: { include: { team: true } } },
  });

  if (kind === "checkin") {
    if (!record.actualCheckIn) throw new Error("NO_CHECK_IN_RECORDED");
    const result = await sendCheckInNotification({
      employeeName: record.user.name,
      teamName: record.user.team.name,
      date: record.date,
      actualCheckIn: record.actualCheckIn,
      scheduledCheckIn: record.scheduledCheckIn,
      isLate: (record.lateMinutes ?? 0) > 0,
      lateMinutes: record.lateMinutes ?? 0,
    });
    return prisma.attendanceRecord.update({
      where: { id: recordId },
      data: { discordCheckInSynced: result.ok, discordCheckInError: result.ok ? null : result.error },
    });
  } else {
    if (!record.actualCheckOut) throw new Error("NO_CHECK_OUT_RECORDED");
    const result = await sendCheckOutNotification({
      employeeName: record.user.name,
      teamName: record.user.team.name,
      date: record.date,
      actualCheckIn: record.actualCheckIn,
      actualCheckOut: record.actualCheckOut,
      totalMinutes: record.totalMinutes,
    });
    return prisma.attendanceRecord.update({
      where: { id: recordId },
      data: { discordCheckOutSynced: result.ok, discordCheckOutError: result.ok ? null : result.error },
    });
  }
}
