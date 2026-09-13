import { prisma } from "@/lib/prisma";
import { startOfDayUTC, combineDateAndTime, minutesLate } from "@/lib/time";
import { sendCheckInNotification, sendCheckOutNotification } from "@/lib/discord";

const OPEN_CHECK_IN_WINDOW_MS = 20 * 60 * 60 * 1000;

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

  let isLate = false;
  let lateMinutes = 0;
  if (record.scheduledCheckIn) {
    const scheduledDate = combineDateAndTime(record.date, record.scheduledCheckIn);
    lateMinutes = minutesLate(scheduledDate, now);
    isLate = lateMinutes > 0;
  }

  const result = await prisma.attendanceRecord.updateMany({
    where: { id: record.id, actualCheckIn: null },
    data: {
      actualCheckIn: now,
      lateMinutes: isLate ? lateMinutes : 0,
      status: isLate ? "LATE" : "ON_TIME",
    },
  });
  if (result.count === 0) {
    throw new Error("ALREADY_CHECKED_IN");
  }

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
  const openRecord = await prisma.attendanceRecord.findFirst({
    where: { userId, actualCheckIn: { not: null }, actualCheckOut: null },
    orderBy: { date: "desc" },
  });

  if (!openRecord?.actualCheckIn) {
    throw new Error("NOT_CHECKED_IN");
  }

  if (now.getTime() - openRecord.actualCheckIn.getTime() > OPEN_CHECK_IN_WINDOW_MS) {
    await prisma.attendanceRecord.update({
      where: { id: openRecord.id },
      data: { status: "MISSING_CHECK_OUT" },
    });
    throw new Error("STALE_CHECK_IN");
  }

  const totalMinutes = Math.round((now.getTime() - openRecord.actualCheckIn.getTime()) / 60000);

  const result = await prisma.attendanceRecord.updateMany({
    where: { id: openRecord.id, actualCheckOut: null },
    data: {
      actualCheckOut: now,
      totalMinutes,
      status: "CHECKED_OUT",
    },
  });
  if (result.count === 0) {
    throw new Error("ALREADY_CHECKED_OUT");
  }

  const discordResult = await sendCheckOutNotification({
    employeeName: user.name,
    teamName: user.team.name,
    date: openRecord.date,
    actualCheckIn: openRecord.actualCheckIn,
    actualCheckOut: now,
    totalMinutes,
  });

  const final = await prisma.attendanceRecord.update({
    where: { id: openRecord.id },
    data: {
      discordCheckOutSynced: discordResult.ok,
      discordCheckOutError: discordResult.ok ? null : discordResult.error,
    },
  });

  return final;
}

export async function flagMissingCheckouts(teamId: string) {
  const cutoff = new Date(Date.now() - OPEN_CHECK_IN_WINDOW_MS);
  const stale = await prisma.attendanceRecord.findMany({
    where: {
      user: { teamId },
      actualCheckIn: { not: null, lt: cutoff },
      actualCheckOut: null,
      status: { notIn: ["MISSING_CHECK_OUT"] },
    },
  });

  if (stale.length === 0) return { flagged: 0 };

  await prisma.attendanceRecord.updateMany({
    where: { id: { in: stale.map((record) => record.id) } },
    data: { status: "MISSING_CHECK_OUT" },
  });

  return { flagged: stale.length };
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
