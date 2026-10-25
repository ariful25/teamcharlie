import { Prisma, type AttendanceRecord } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { startOfDayUTC, minutesLate } from "@/lib/time";
import { notifyCheckIn, notifyCheckOut, sendCheckInVia, sendCheckOutVia } from "@/lib/notifications";
import { autoStopAt, canReview, minutesBetween, resolveShiftForCheckIn, shiftWindow } from "@/lib/attendance/rules";
import { dayLabel } from "@/lib/attendance/format";

// The workflow behind docs/attendance-rules.md. Pure decisions (auto-stop
// time, hour splits, shift resolution) live in lib/attendance/rules.ts; this
// file applies them to the database and sends notifications.

const DAY_MS = 24 * 60 * 60 * 1000;
const SYSTEM_ACTOR = "system";

export class AttendanceError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

type Reviewer = { id: string; name: string; role: string; teamId: string };

async function loadUser(userId: string) {
  return prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { team: { include: { settings: { select: { autoCheckoutHours: true } } } } },
  });
}

function dayFromKey(key: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new AttendanceError("INVALID_DATE", "Pick a valid date.");
  return new Date(`${key}T00:00:00.000Z`);
}

async function audit(
  tx: Prisma.TransactionClient | typeof prisma,
  recordId: string,
  actorId: string,
  action: string,
  before: unknown,
  after: unknown,
  note?: string | null
) {
  await tx.attendanceAudit.create({
    data: {
      recordId,
      actorId,
      action,
      before: before === undefined ? Prisma.JsonNull : (JSON.parse(JSON.stringify(before)) as Prisma.InputJsonValue),
      after: after === undefined ? Prisma.JsonNull : (JSON.parse(JSON.stringify(after)) as Prisma.InputJsonValue),
      note: note ?? null,
    },
  });
}

/** The fields worth showing in an audit before/after. */
function snapshot(r: AttendanceRecord) {
  return {
    actualCheckIn: r.actualCheckIn,
    actualCheckOut: r.actualCheckOut,
    effectiveCheckIn: r.effectiveCheckIn,
    effectiveCheckOut: r.effectiveCheckOut,
    claimedCheckIn: r.claimedCheckIn,
    claimedCheckOut: r.claimedCheckOut,
    autoClosedAt: r.autoClosedAt,
    reportedCheckOutAt: r.reportedCheckOutAt,
    checkInRequestedAt: r.checkInRequestedAt,
    review: r.review,
    status: r.status,
  };
}

export async function approvedOvertimeMinutes(userId: string, date: Date) {
  const rows = await prisma.overtimeRequest.findMany({
    where: { userId, date, status: "APPROVED" },
    select: { approvedMinutes: true, requestedMinutes: true },
  });
  return rows.reduce((sum, r) => sum + (r.approvedMinutes ?? r.requestedMinutes), 0);
}

/** Schedule for one person on one day, as both "HH:mm" strings (kept for
 *  display/back-compat) and absolute instants. */
async function scheduleFor(userId: string, date: Date, tz: string) {
  const assignment = await prisma.shiftAssignment.findUnique({
    where: { userId_date: { userId, date } },
    include: { shiftType: true },
  });
  const working = assignment?.status === "WORKING";
  const start = working ? assignment?.customStart ?? assignment?.shiftType?.startTime ?? null : null;
  const end = working ? assignment?.customEnd ?? assignment?.shiftType?.endTime ?? null : null;
  const window = start && end ? shiftWindow(date, start, end, tz) : null;
  return {
    scheduledCheckIn: start,
    scheduledCheckOut: end,
    shiftStartAt: window?.startAt ?? null,
    shiftEndAt: window?.endAt ?? null,
  };
}

/** The record for (user, shift day), created with its schedule if missing. */
export async function getOrCreateRecordForDay(userId: string, date: Date, tz: string) {
  const existing = await prisma.attendanceRecord.findUnique({ where: { userId_date: { userId, date } } });
  if (existing) return existing;
  const schedule = await scheduleFor(userId, date, tz);
  try {
    return await prisma.attendanceRecord.create({
      data: { userId, date, ...schedule, status: "MISSING_CHECK_IN" },
    });
  } catch (err) {
    // Two requests racing to create the same day — the unique constraint
    // means the other one won; use its row.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return prisma.attendanceRecord.findUniqueOrThrow({ where: { userId_date: { userId, date } } });
    }
    throw err;
  }
}

/** Which shift day a check-in at `now` belongs to (handles overnight shifts
 *  and checking in a little early for a shift that starts after midnight). */
async function resolveShiftDay(userId: string, now: Date, tz: string) {
  const today = startOfDayUTC(now, tz);
  const days = [new Date(today.getTime() - DAY_MS), today, new Date(today.getTime() + DAY_MS)];
  const [assignments, records] = await Promise.all([
    prisma.shiftAssignment.findMany({
      where: { userId, date: { in: days }, status: "WORKING" },
      include: { shiftType: true },
    }),
    prisma.attendanceRecord.findMany({ where: { userId, date: { in: days } }, select: { date: true, actualCheckIn: true } }),
  ]);
  const alreadyWorked = new Set(records.filter((r) => r.actualCheckIn).map((r) => r.date.getTime()));
  const candidates = assignments
    .filter((a) => !alreadyWorked.has(a.date.getTime()))
    .map((a) => {
      const start = a.customStart ?? a.shiftType?.startTime;
      const end = a.customEnd ?? a.shiftType?.endTime;
      return start && end ? { date: a.date, ...shiftWindow(a.date, start, end, tz) } : null;
    })
    .filter((c): c is NonNullable<typeof c> => !!c);
  return resolveShiftForCheckIn(candidates, now)?.date ?? today;
}

/** A session that's genuinely running right now. An auto-stopped or
 *  already-approved/rejected record never counts as "working". */
export function findOpenSession(userId: string) {
  return prisma.attendanceRecord.findFirst({
    where: {
      userId,
      actualCheckIn: { not: null },
      actualCheckOut: null,
      autoClosedAt: null,
      review: { in: ["NONE", "PENDING"] },
    },
    orderBy: { date: "desc" },
  });
}

/** An unresolved forgotten check-out — blocks the next check-in until a lead
 *  resolves it (docs/attendance-rules.md, rule 4). */
export function findBlockingRecord(userId: string, excludeId?: string) {
  return prisma.attendanceRecord.findFirst({
    where: { userId, blocksCheckIn: true, review: "PENDING", ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    orderBy: { date: "asc" },
  });
}

/**
 * Stops every open session whose auto-stop time has passed: the later of
 * check-in + the team's auto-stop hours and scheduled end + approved
 * overtime. Marks it missed-check-out / needs review. No notification is sent
 * here — that waits for the employee's confirmation or the lead's approval.
 * Idempotent; runs from page loads (throttled), check-in/out and the cron.
 */
export async function autoStopOpenSessions(scope: { teamId?: string; userId?: string }, now: Date = new Date()) {
  const open = await prisma.attendanceRecord.findMany({
    where: {
      actualCheckIn: { not: null },
      actualCheckOut: null,
      autoClosedAt: null,
      review: { in: ["NONE", "PENDING"] },
      ...(scope.userId ? { userId: scope.userId } : { user: { teamId: scope.teamId } }),
    },
    include: { user: { select: { team: { select: { settings: { select: { autoCheckoutHours: true } } } } } } },
  });
  if (open.length === 0) return { stopped: 0 };

  const overtime = await prisma.overtimeRequest.findMany({
    where: { status: "APPROVED", OR: open.map((r) => ({ userId: r.userId, date: r.date })) },
    select: { userId: true, date: true, approvedMinutes: true, requestedMinutes: true },
  });

  let stopped = 0;
  for (const r of open) {
    const ot = overtime
      .filter((o) => o.userId === r.userId && o.date.getTime() === r.date.getTime())
      .reduce((s, o) => s + (o.approvedMinutes ?? o.requestedMinutes), 0);
    const stopAt = autoStopAt({
      checkIn: r.actualCheckIn!,
      shiftEndAt: r.shiftEndAt,
      approvedOvertimeMinutes: ot,
      capHours: r.user.team.settings?.autoCheckoutHours ?? 10,
    });
    if (now.getTime() < stopAt.getTime()) continue;

    const result = await prisma.attendanceRecord.updateMany({
      where: { id: r.id, autoClosedAt: null, actualCheckOut: null },
      data: { autoClosedAt: stopAt, missedCheckOut: true, blocksCheckIn: true, review: "PENDING", status: "MISSING_CHECK_OUT" },
    });
    if (result.count === 1) {
      stopped++;
      await audit(prisma, r.id, SYSTEM_ACTOR, "AUTO_STOP", snapshot(r), { autoClosedAt: stopAt }, "No check-out, so the timer stopped automatically.");
    }
  }
  return { stopped };
}

function dateKeyOf(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function checkIn(userId: string) {
  const now = new Date();
  const user = await loadUser(userId);
  const tz = user.team.timezone;

  await autoStopOpenSessions({ userId }, now);

  const blocking = await findBlockingRecord(userId);
  if (blocking) {
    throw new AttendanceError(
      "BLOCKED",
      `Your shift on ${dayLabel(dateKeyOf(blocking.date), "EEE d MMM")} has no check-out yet. A team lead has to confirm it before you can check in. Use “Request check-in” so your start time is recorded.`,
      409
    );
  }
  if (await findOpenSession(userId)) {
    throw new AttendanceError("ALREADY_CHECKED_IN", "You're already checked in.", 409);
  }

  const date = await resolveShiftDay(userId, now, tz);
  const record = await getOrCreateRecordForDay(userId, date, tz);
  if (record.actualCheckIn) throw new AttendanceError("ALREADY_CHECKED_IN", "You've already checked in for this shift.", 409);
  if (record.checkInRequestedAt) {
    throw new AttendanceError("REQUEST_PENDING", "Your check-in request for this shift is waiting for a team lead.", 409);
  }

  const lateMinutes = record.shiftStartAt ? minutesLate(record.shiftStartAt, now) : 0;
  const result = await prisma.attendanceRecord.updateMany({
    where: { id: record.id, actualCheckIn: null },
    data: { actualCheckIn: now, lateMinutes, status: lateMinutes > 0 ? "LATE" : "ON_TIME" },
  });
  if (result.count === 0) throw new AttendanceError("ALREADY_CHECKED_IN", "You've already checked in for this shift.", 409);

  // Notifications never roll back or block the attendance write.
  const { discord, slack } = await notifyCheckIn(user.teamId, {
    employeeName: user.name,
    teamName: user.team.name,
    timezone: tz,
    date: record.date,
    actualCheckIn: now,
    scheduledCheckIn: record.scheduledCheckIn,
    isLate: lateMinutes > 0,
    lateMinutes,
  });
  return prisma.attendanceRecord.update({
    where: { id: record.id },
    data: {
      discordCheckInSynced: discord.ok,
      discordCheckInError: discord.ok ? null : discord.error,
      slackCheckInSynced: slack.ok,
      slackCheckInError: slack.ok ? null : slack.error,
    },
  });
}

/** Blocked by an unresolved shift: record when they tried to start (a real
 *  server timestamp) for a lead to approve — conflict #5. */
export async function requestCheckIn(userId: string, note?: string) {
  const now = new Date();
  const user = await loadUser(userId);
  const tz = user.team.timezone;
  await autoStopOpenSessions({ userId }, now);

  if (!(await findBlockingRecord(userId))) {
    throw new AttendanceError("NOT_BLOCKED", "Nothing is blocking you. Just press Check In.", 409);
  }
  const date = await resolveShiftDay(userId, now, tz);
  const record = await getOrCreateRecordForDay(userId, date, tz);
  if (record.actualCheckIn) throw new AttendanceError("ALREADY_CHECKED_IN", "You've already checked in for this shift.", 409);
  if (record.checkInRequestedAt) throw new AttendanceError("REQUEST_PENDING", "You've already requested check-in for this shift.", 409);

  const updated = await prisma.attendanceRecord.update({
    where: { id: record.id },
    data: { checkInRequestedAt: now, review: "PENDING", claimReason: note?.trim() || record.claimReason },
  });
  await audit(prisma, record.id, userId, "REQUEST_CHECK_IN", snapshot(record), { checkInRequestedAt: now }, note);
  return updated;
}

type ChecklistAnswer = { id: string; label: string; checked: boolean };

export async function checkOut(userId: string, checklist?: ChecklistAnswer[]) {
  const now = new Date();
  const user = await loadUser(userId);
  await autoStopOpenSessions({ userId }, now);

  // Re-verify server-side rather than trusting the browser's "all checked"
  // gate — a missing or unchecked active item means the UI was bypassed.
  const activeItems = await prisma.checklistItem.findMany({ where: { teamId: user.teamId, type: "CHECKOUT", active: true } });
  if (activeItems.length > 0) {
    const answered = new Map((checklist ?? []).map((a) => [a.id, a.checked]));
    if (!activeItems.every((item) => answered.get(item.id) === true)) {
      throw new AttendanceError("CHECKLIST_INCOMPLETE", "Please confirm every checklist item before checking out.");
    }
  }
  const checklistJson = checklist && checklist.length > 0 ? (checklist as Prisma.InputJsonValue) : undefined;

  const open = await findOpenSession(userId);
  if (open) {
    const totalMinutes = minutesBetween(open.actualCheckIn!, now);
    const result = await prisma.attendanceRecord.updateMany({
      where: { id: open.id, actualCheckOut: null, autoClosedAt: null },
      data: { actualCheckOut: now, totalMinutes, status: "CHECKED_OUT", checkoutChecklist: checklistJson, checkoutNotifiedAt: now },
    });
    if (result.count === 0) throw new AttendanceError("ALREADY_CHECKED_OUT", "You've already checked out.", 409);

    const { discord, slack } = await notifyCheckOut(user.teamId, {
      employeeName: user.name,
      teamName: user.team.name,
      timezone: user.team.timezone,
      date: open.date,
      actualCheckIn: open.actualCheckIn,
      actualCheckOut: now,
      totalMinutes,
    });
    return prisma.attendanceRecord.update({
      where: { id: open.id },
      data: {
        discordCheckOutSynced: discord.ok,
        discordCheckOutError: discord.ok ? null : discord.error,
        slackCheckOutSynced: slack.ok,
        slackCheckOutError: slack.ok ? null : slack.error,
      },
    });
  }

  // Auto-stopped and not confirmed yet: record when they actually pressed
  // check-out (and the checklist), notify now — still needs a lead's review.
  const stopped = await prisma.attendanceRecord.findFirst({
    where: { userId, autoClosedAt: { not: null }, actualCheckOut: null, reportedCheckOutAt: null, review: "PENDING" },
    orderBy: { date: "desc" },
  });
  if (!stopped) throw new AttendanceError("NOT_CHECKED_IN", "You haven't checked in yet.", 409);

  const updated = await prisma.attendanceRecord.update({
    where: { id: stopped.id },
    data: { reportedCheckOutAt: now, checkoutChecklist: checklistJson, checkoutNotifiedAt: now },
  });
  await audit(prisma, stopped.id, userId, "CONFIRM_CHECKOUT", snapshot(stopped), { reportedCheckOutAt: now });

  const capHours = user.team.settings?.autoCheckoutHours ?? 10;
  const { discord, slack } = await notifyCheckOut(user.teamId, {
    employeeName: user.name,
    teamName: user.team.name,
    timezone: user.team.timezone,
    date: stopped.date,
    actualCheckIn: stopped.actualCheckIn,
    actualCheckOut: now,
    totalMinutes: null,
    note: `Timer stopped automatically (no check-out within ${capHours}h). Hours are pending team lead review.`,
  });
  return prisma.attendanceRecord.update({
    where: { id: updated.id },
    data: {
      discordCheckOutSynced: discord.ok,
      discordCheckOutError: discord.ok ? null : discord.error,
      slackCheckOutSynced: slack.ok,
      slackCheckOutError: slack.ok ? null : slack.error,
    },
  });
}

/** Employee's claim for a missed punch ("I started earlier", "I forgot to
 *  check out at …", or a whole missed shift). Only ever a claim — a lead
 *  confirms the real times later. */
export async function submitClaim(
  userId: string,
  input: { date: string; claimedCheckIn?: string | null; claimedCheckOut?: string | null; reason: string }
) {
  const user = await loadUser(userId);
  const tz = user.team.timezone;
  const date = dayFromKey(input.date);
  const today = startOfDayUTC(new Date(), tz);
  if (date.getTime() > today.getTime() || date.getTime() < today.getTime() - 14 * DAY_MS) {
    throw new AttendanceError("INVALID_DATE", "Corrections can be requested for the last 14 days.");
  }
  const claimedIn = input.claimedCheckIn ? new Date(input.claimedCheckIn) : null;
  const claimedOut = input.claimedCheckOut ? new Date(input.claimedCheckOut) : null;
  if (!claimedIn && !claimedOut) throw new AttendanceError("INVALID_CLAIM", "Enter the time you started, finished or both.");
  if ((claimedIn && isNaN(claimedIn.getTime())) || (claimedOut && isNaN(claimedOut.getTime()))) {
    throw new AttendanceError("INVALID_CLAIM", "One of the times isn't valid.");
  }
  const now = Date.now();
  if ((claimedIn && claimedIn.getTime() > now) || (claimedOut && claimedOut.getTime() > now)) {
    throw new AttendanceError("INVALID_CLAIM", "You can't claim a time in the future.");
  }

  const record = await getOrCreateRecordForDay(userId, date, tz);
  if (record.review === "APPROVED") {
    throw new AttendanceError("ALREADY_APPROVED", "This shift was already confirmed. Ask your team lead to correct it.", 409);
  }
  if (claimedIn && record.actualCheckIn && claimedIn.getTime() >= record.actualCheckIn.getTime()) {
    throw new AttendanceError("INVALID_CLAIM", "Your claimed start must be earlier than your recorded check-in.");
  }
  if (claimedOut && record.actualCheckOut) {
    throw new AttendanceError("INVALID_CLAIM", "You already checked out for this shift.");
  }
  const start = claimedIn ?? record.actualCheckIn;
  if (claimedOut && start) {
    if (claimedOut.getTime() <= start.getTime()) throw new AttendanceError("INVALID_CLAIM", "The finish time must be after the start.");
    if (claimedOut.getTime() - start.getTime() > DAY_MS) throw new AttendanceError("INVALID_CLAIM", "A shift can't be longer than 24 hours.");
  }

  const updated = await prisma.attendanceRecord.update({
    where: { id: record.id },
    data: {
      claimedCheckIn: claimedIn ?? record.claimedCheckIn,
      claimedCheckOut: claimedOut ?? record.claimedCheckOut,
      claimReason: input.reason.trim(),
      missedCheckIn: record.missedCheckIn || !!claimedIn,
      missedCheckOut: record.missedCheckOut || (!!claimedOut && !record.actualCheckOut),
      review: "PENDING",
    },
  });
  await audit(prisma, record.id, userId, "CLAIM", snapshot(record), { claimedCheckIn: claimedIn, claimedCheckOut: claimedOut }, input.reason);
  return updated;
}

export type ReviewInput = {
  recordId?: string;
  userId?: string;
  date?: string;
  action: "APPROVE" | "REJECT" | "APPROVE_CHECK_IN";
  checkIn?: string | null;
  checkOut?: string | null;
  tasksConfirmed?: boolean;
  note?: string | null;
};

/** Lead/admin decision on a record (or on a scheduled day with no record —
 *  a fully missed shift). Approval always takes BOTH times (rule 5). */
export async function reviewRecord(reviewer: Reviewer, input: ReviewInput) {
  let record: AttendanceRecord | null = null;
  if (input.recordId) {
    record = await prisma.attendanceRecord.findFirst({ where: { id: input.recordId, user: { teamId: reviewer.teamId } } });
  } else if (input.userId && input.date) {
    const subject = await prisma.user.findFirst({ where: { id: input.userId, teamId: reviewer.teamId } });
    if (subject) {
      const team = await prisma.team.findUniqueOrThrow({ where: { id: reviewer.teamId }, select: { timezone: true } });
      const date = dayFromKey(input.date);
      if (date.getTime() > startOfDayUTC(new Date(), team.timezone).getTime()) {
        throw new AttendanceError("INVALID_DATE", "You can't confirm a shift in the future.");
      }
      record = await getOrCreateRecordForDay(subject.id, date, team.timezone);
    }
  }
  if (!record) throw new AttendanceError("NOT_FOUND", "Attendance record not found.", 404);
  if (!canReview(reviewer, record.userId)) {
    throw new AttendanceError("SELF_REVIEW", "You can't approve your own attendance. Ask another team lead or an admin.", 403);
  }

  const subject = await loadUser(record.userId);
  const selfApproved = reviewer.id === record.userId;
  const note = [selfApproved ? "[self-approved]" : null, input.note?.trim() || null].filter(Boolean).join(" ") || null;
  const before = snapshot(record);
  const now = new Date();

  if (input.action === "APPROVE_CHECK_IN") {
    if (!record.checkInRequestedAt || record.actualCheckIn) {
      throw new AttendanceError("NO_REQUEST", "There's no pending check-in request on this shift.");
    }
    if (await findBlockingRecord(record.userId, record.id)) {
      throw new AttendanceError("RESOLVE_PREVIOUS_FIRST", "Resolve this person's earlier shift with no check-out first.", 409);
    }
    const requestedAt = record.checkInRequestedAt;
    const lateMinutes = record.shiftStartAt ? minutesLate(record.shiftStartAt, requestedAt) : 0;
    const updated = await prisma.attendanceRecord.update({
      where: { id: record.id },
      data: {
        actualCheckIn: requestedAt,
        lateMinutes,
        status: lateMinutes > 0 ? "LATE" : "ON_TIME",
        // Only a still-open claim keeps it in the queue.
        review: record.claimedCheckIn || record.claimedCheckOut ? "PENDING" : "NONE",
        reviewedBy: reviewer.id,
        reviewedAt: now,
        reviewNote: note,
      },
    });
    await audit(prisma, record.id, reviewer.id, "APPROVE_CHECK_IN", before, snapshot(updated), note);
    const { discord, slack } = await notifyCheckIn(subject.teamId, {
      employeeName: subject.name,
      teamName: subject.team.name,
      timezone: subject.team.timezone,
      date: record.date,
      actualCheckIn: requestedAt,
      scheduledCheckIn: record.scheduledCheckIn,
      isLate: lateMinutes > 0,
      lateMinutes,
      note: `Check-in approved by ${reviewer.name}.`,
    });
    await prisma.attendanceRecord.update({
      where: { id: record.id },
      data: { discordCheckInSynced: discord.ok, slackCheckInSynced: slack.ok },
    });
    return updated;
  }

  if (input.action === "REJECT") {
    if (!input.note?.trim()) throw new AttendanceError("NOTE_REQUIRED", "Add a short note explaining the decision.");
    const updated = await prisma.attendanceRecord.update({
      where: { id: record.id },
      data: {
        review: "REJECTED",
        reviewedBy: reviewer.id,
        reviewedAt: now,
        reviewNote: note,
        effectiveCheckIn: null,
        effectiveCheckOut: null,
        status: record.actualCheckIn ? record.status : "MISSING_CHECK_IN",
      },
    });
    await audit(prisma, record.id, reviewer.id, "REJECT", before, snapshot(updated), note);
    return updated;
  }

  // APPROVE — both times, tasks confirmed.
  const checkIn = input.checkIn ? new Date(input.checkIn) : null;
  const checkOut = input.checkOut ? new Date(input.checkOut) : null;
  if (!checkIn || !checkOut || isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
    throw new AttendanceError("BOTH_TIMES_REQUIRED", "Enter both the check-in and the check-out time.");
  }
  if (checkOut.getTime() <= checkIn.getTime()) throw new AttendanceError("INVALID_TIMES", "Check-out must be after check-in.");
  if (checkOut.getTime() - checkIn.getTime() > DAY_MS) throw new AttendanceError("INVALID_TIMES", "A shift can't be longer than 24 hours.");
  if (checkOut.getTime() > now.getTime() + 5 * 60 * 1000) throw new AttendanceError("INVALID_TIMES", "Check-out can't be in the future.");
  if (input.tasksConfirmed !== true) {
    throw new AttendanceError("TASKS_NOT_CONFIRMED", "Confirm the scheduled tasks are complete before approving.");
  }

  const noPunchIn = !record.actualCheckIn && !record.checkInRequestedAt;
  const updated = await prisma.attendanceRecord.update({
    where: { id: record.id },
    data: {
      effectiveCheckIn: checkIn,
      effectiveCheckOut: checkOut,
      review: "APPROVED",
      reviewedBy: reviewer.id,
      reviewedAt: now,
      reviewNote: note,
      tasksConfirmed: true,
      status: "CHECKED_OUT",
      // A forgotten check-in counts as a late check-in (team rule).
      missedCheckIn: record.missedCheckIn || noPunchIn,
      missedCheckOut: record.missedCheckOut || !record.actualCheckOut,
      lateMinutes: record.actualCheckIn
        ? record.lateMinutes
        : record.shiftStartAt
          ? minutesLate(record.shiftStartAt, checkIn)
          : 0,
    },
  });
  await audit(prisma, record.id, reviewer.id, before.review === "APPROVED" ? "CORRECT" : "APPROVE", before, snapshot(updated), note);

  // The check-out notification for a forgotten check-out is sent only now,
  // once someone has confirmed it (unless the employee already confirmed).
  if (!record.checkoutNotifiedAt) {
    const { discord, slack } = await notifyCheckOut(subject.teamId, {
      employeeName: subject.name,
      teamName: subject.team.name,
      timezone: subject.team.timezone,
      date: record.date,
      actualCheckIn: checkIn,
      actualCheckOut: checkOut,
      totalMinutes: minutesBetween(checkIn, checkOut),
      note: `Confirmed by ${reviewer.name}.`,
    });
    await prisma.attendanceRecord.update({
      where: { id: record.id },
      data: { checkoutNotifiedAt: now, discordCheckOutSynced: discord.ok, slackCheckOutSynced: slack.ok },
    });
  }
  return updated;
}

// Retries exactly the one channel that failed — never fans out to both, since
// the other channel may already be synced and shouldn't get a duplicate post.
export async function retryNotificationSync(recordId: string, kind: "checkin" | "checkout", channel: "discord" | "slack") {
  const record = await prisma.attendanceRecord.findUniqueOrThrow({
    where: { id: recordId },
    include: { user: { include: { team: true } } },
  });

  if (kind === "checkin") {
    const checkInAt = record.actualCheckIn ?? record.effectiveCheckIn;
    if (!checkInAt) throw new Error("NO_CHECK_IN_RECORDED");
    const result = await sendCheckInVia(channel, record.user.teamId, {
      employeeName: record.user.name,
      teamName: record.user.team.name,
      timezone: record.user.team.timezone,
      date: record.date,
      actualCheckIn: checkInAt,
      scheduledCheckIn: record.scheduledCheckIn,
      isLate: (record.lateMinutes ?? 0) > 0,
      lateMinutes: record.lateMinutes ?? 0,
    });
    const data =
      channel === "discord"
        ? { discordCheckInSynced: result.ok, discordCheckInError: result.ok ? null : result.error }
        : { slackCheckInSynced: result.ok, slackCheckInError: result.ok ? null : result.error };
    return prisma.attendanceRecord.update({ where: { id: recordId }, data });
  }

  const checkOutAt = record.actualCheckOut ?? record.effectiveCheckOut ?? record.reportedCheckOutAt;
  if (!checkOutAt) throw new Error("NO_CHECK_OUT_RECORDED");
  const result = await sendCheckOutVia(channel, record.user.teamId, {
    employeeName: record.user.name,
    teamName: record.user.team.name,
    timezone: record.user.team.timezone,
    date: record.date,
    actualCheckIn: record.actualCheckIn ?? record.effectiveCheckIn,
    actualCheckOut: checkOutAt,
    totalMinutes: record.totalMinutes,
  });
  const data =
    channel === "discord"
      ? { discordCheckOutSynced: result.ok, discordCheckOutError: result.ok ? null : result.error }
      : { slackCheckOutSynced: result.ok, slackCheckOutError: result.ok ? null : result.error };
  return prisma.attendanceRecord.update({ where: { id: recordId }, data });
}
