import { inSquad, reachable, type Scope } from "@/lib/scope";
import type { AttendanceRecord, OvertimeRequest, ShiftAssignment, ShiftType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getTeamTimezone } from "@/lib/team-timezone";
import { startOfDayUTC, startOfWeekMonday, dayKey } from "@/lib/time";
import { autoStopAt, creditFor, exceedsDailyLimit, minutesBetween, shiftWindow, type Credit } from "@/lib/attendance/rules";
import { autoStopOpenSessions } from "@/lib/services/attendance";

// Read side of attendance. Everything returned here is plain JSON (ISO
// strings, no Date objects) so it can go straight into client components.
// Every row carries its shift day explicitly — the old Team Attendance page
// made it hard to tell which day you were looking at.

const DAY_MS = 24 * 60 * 60 * 1000;

export type ShiftState =
  | "OFF" // not scheduled / weekend
  | "LEAVE"
  | "NOT_STARTED"
  | "LATE_NOT_IN" // shift started, no check-in yet
  | "MISSED_SHIFT" // shift over, no punches, nothing decided
  | "WORKING"
  | "REQUESTED_CHECK_IN"
  | "AUTO_STOPPED"
  | "NEEDS_REVIEW"
  | "ABSENT"
  | "DONE";

export type RecordView = {
  id: string | null;
  userId: string;
  userName: string;
  date: string; // yyyy-MM-dd shift day
  shiftName: string | null;
  dayStatus: string | null;
  scheduledCheckIn: string | null;
  scheduledCheckOut: string | null;
  shiftStartAt: string | null;
  shiftEndAt: string | null;
  actualCheckIn: string | null;
  actualCheckOut: string | null;
  effectiveCheckIn: string | null;
  effectiveCheckOut: string | null;
  claimedCheckIn: string | null;
  claimedCheckOut: string | null;
  claimReason: string | null;
  autoClosedAt: string | null;
  reportedCheckOutAt: string | null;
  checkInRequestedAt: string | null;
  review: "NONE" | "PENDING" | "APPROVED" | "REJECTED";
  reviewNote: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  lateMinutes: number;
  missedCheckIn: boolean;
  missedCheckOut: boolean;
  overtimeApprovedMinutes: number;
  overtimePendingMinutes: number;
  credit: Credit;
  state: ShiftState;
};

type AssignmentWithType = ShiftAssignment & { shiftType: ShiftType | null };

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

function scheduleOf(a: AssignmentWithType | null | undefined, date: Date, tz: string) {
  if (!a || a.status !== "WORKING") return null;
  const start = a.customStart ?? a.shiftType?.startTime;
  const end = a.customEnd ?? a.shiftType?.endTime;
  if (!start || !end) return null;
  return { start, end, ...shiftWindow(date, start, end, tz) };
}

function overtimeTotals(requests: OvertimeRequest[]) {
  return {
    approved: requests.filter((r) => r.status === "APPROVED").reduce((s, r) => s + (r.approvedMinutes ?? r.requestedMinutes), 0),
    pending: requests.filter((r) => r.status === "PENDING").reduce((s, r) => s + r.requestedMinutes, 0),
  };
}

function stateOf(record: AttendanceRecord | null, assignment: AssignmentWithType | null, schedule: ReturnType<typeof scheduleOf>, now: Date): ShiftState {
  if (record) {
    if (record.checkInRequestedAt && !record.actualCheckIn && record.review === "PENDING") return "REQUESTED_CHECK_IN";
    if (record.actualCheckIn && !record.actualCheckOut && !record.autoClosedAt && (record.review === "NONE" || record.review === "PENDING")) {
      return "WORKING";
    }
    if (record.autoClosedAt && record.review === "PENDING") return "AUTO_STOPPED";
    if (record.review === "PENDING") return "NEEDS_REVIEW";
    if (record.review === "REJECTED" && !record.actualCheckIn) return "ABSENT";
    if (record.actualCheckOut || record.review === "APPROVED" || record.review === "REJECTED") return "DONE";
  }
  if (assignment && assignment.status !== "WORKING") return assignment.status === "WEEKEND" ? "OFF" : "LEAVE";
  if (!schedule) return "OFF";
  if (now.getTime() >= schedule.endAt.getTime()) return "MISSED_SHIFT";
  if (now.getTime() >= schedule.startAt.getTime()) return "LATE_NOT_IN";
  return "NOT_STARTED";
}

function buildView(input: {
  user: { id: string; name: string };
  date: Date;
  record: AttendanceRecord | null;
  assignment: AssignmentWithType | null;
  overtime: OvertimeRequest[];
  names: Map<string, string>;
  tz: string;
  now: Date;
}): RecordView {
  const { record: r, assignment, tz, now } = input;
  const schedule = scheduleOf(assignment, input.date, tz);
  const ot = overtimeTotals(input.overtime);
  const shiftStartAt = r?.shiftStartAt ?? schedule?.startAt ?? null;
  const shiftEndAt = r?.shiftEndAt ?? schedule?.endAt ?? null;
  const credit = r
    ? creditFor({ ...r, shiftStartAt, shiftEndAt, review: r.review }, ot.approved)
    : { bucket: "none" as const, workedMinutes: 0, regularMinutes: 0, overtimeMinutes: 0, extraMinutes: 0 };
  return {
    id: r?.id ?? null,
    userId: input.user.id,
    userName: input.user.name,
    date: dayKey(input.date),
    shiftName: assignment?.shiftType?.name ?? null,
    dayStatus: assignment?.status ?? null,
    scheduledCheckIn: r?.scheduledCheckIn ?? schedule?.start ?? null,
    scheduledCheckOut: r?.scheduledCheckOut ?? schedule?.end ?? null,
    shiftStartAt: iso(shiftStartAt),
    shiftEndAt: iso(shiftEndAt),
    actualCheckIn: iso(r?.actualCheckIn),
    actualCheckOut: iso(r?.actualCheckOut),
    effectiveCheckIn: iso(r?.effectiveCheckIn),
    effectiveCheckOut: iso(r?.effectiveCheckOut),
    claimedCheckIn: iso(r?.claimedCheckIn),
    claimedCheckOut: iso(r?.claimedCheckOut),
    claimReason: r?.claimReason ?? null,
    autoClosedAt: iso(r?.autoClosedAt),
    reportedCheckOutAt: iso(r?.reportedCheckOutAt),
    checkInRequestedAt: iso(r?.checkInRequestedAt),
    review: r?.review ?? "NONE",
    reviewNote: r?.reviewNote ?? null,
    reviewedByName: r?.reviewedBy ? input.names.get(r.reviewedBy) ?? null : null,
    reviewedAt: iso(r?.reviewedAt),
    lateMinutes: r?.lateMinutes ?? 0,
    missedCheckIn: r?.missedCheckIn ?? false,
    missedCheckOut: r?.missedCheckOut ?? false,
    overtimeApprovedMinutes: ot.approved,
    overtimePendingMinutes: ot.pending,
    credit,
    state: stateOf(r, assignment, schedule, now),
  };
}

async function namesFor(teamId: string) {
  const users = await prisma.user.findMany({ where: { teamId }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

const key = (userId: string, date: Date) => `${userId}:${date.getTime()}`;

/** Everyone on one shift day — the Team Attendance roster. */
export async function getTeamDay(scope: Scope, day: Date) {
  const { teamId } = scope;
  const people = inSquad(scope);
  const tz = await getTeamTimezone(teamId);
  await autoStopOpenSessions({ teamId });
  const now = new Date();
  const [employees, assignments, records, overtime, names] = await Promise.all([
    prisma.user.findMany({ where: { ...people, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.shiftAssignment.findMany({ where: { date: day, user: people }, include: { shiftType: true } }),
    prisma.attendanceRecord.findMany({ where: { date: day, user: people } }),
    prisma.overtimeRequest.findMany({ where: { teamId, user: people, date: day } }),
    namesFor(teamId),
  ]);

  const rows = employees.map((u) =>
    buildView({
      user: u,
      date: day,
      record: records.find((r) => r.userId === u.id) ?? null,
      assignment: assignments.find((a) => a.userId === u.id) ?? null,
      overtime: overtime.filter((o) => o.userId === u.id),
      names,
      tz,
      now,
    })
  );
  // Inactive people who still have a record that day (e.g. deactivated since).
  return { date: dayKey(day), isToday: day.getTime() === startOfDayUTC(now, tz).getTime(), rows };
}

/** Everything a lead still has to decide, across all days: pending records
 *  (auto-stopped, claims, check-in requests) and recent fully missed shifts. */
export async function getReviewQueue(scope: Scope) {
  const { teamId } = scope;
  const people = inSquad(scope);
  const tz = await getTeamTimezone(teamId);
  await autoStopOpenSessions({ teamId });
  const now = new Date();
  const today = startOfDayUTC(now, tz);
  const since = new Date(today.getTime() - 7 * DAY_MS);

  const [pending, recentAssignments, recentRecords, names] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { review: "PENDING", user: people },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { date: "asc" },
    }),
    prisma.shiftAssignment.findMany({
      where: { date: { gte: since, lte: today }, status: "WORKING", user: { ...people, active: true } },
      include: { shiftType: true, user: { select: { id: true, name: true } } },
    }),
    prisma.attendanceRecord.findMany({ where: { date: { gte: since, lte: today }, user: people } }),
    namesFor(teamId),
  ]);
  const days = Array.from(new Set([...pending.map((r) => r.date.getTime()), ...recentAssignments.map((a) => a.date.getTime())]));
  const [assignmentsForPending, overtime] = await Promise.all([
    prisma.shiftAssignment.findMany({
      where: { user: people, date: { in: days.map((d) => new Date(d)) } },
      include: { shiftType: true },
    }),
    prisma.overtimeRequest.findMany({ where: { teamId, user: people, date: { in: days.map((d) => new Date(d)) } } }),
  ]);
  const assignmentByKey = new Map(assignmentsForPending.map((a) => [key(a.userId, a.date), a]));
  const otFor = (userId: string, date: Date) => overtime.filter((o) => o.userId === userId && o.date.getTime() === date.getTime());

  const items: RecordView[] = pending.map((r) =>
    buildView({ user: r.user, date: r.date, record: r, assignment: assignmentByKey.get(key(r.userId, r.date)) ?? null, overtime: otFor(r.userId, r.date), names, tz, now })
  );

  const recordByKey = new Map(recentRecords.map((r) => [key(r.userId, r.date), r]));
  for (const a of recentAssignments) {
    const record = recordByKey.get(key(a.userId, a.date)) ?? null;
    if (record && (record.actualCheckIn || record.review !== "NONE" || record.checkInRequestedAt)) continue;
    const view = buildView({ user: a.user, date: a.date, record, assignment: a, overtime: otFor(a.userId, a.date), names, tz, now });
    if (view.state === "MISSED_SHIFT") items.push(view);
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.userName.localeCompare(b.userName));
}

export type OvertimeView = {
  id: string;
  userId: string;
  userName: string;
  date: string;
  requestedMinutes: number;
  approvedMinutes: number | null;
  reason: string;
  askedByName: string | null;
  publicHoliday: boolean;
  submittedAfterShift: boolean;
  status: string;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  scheduledLabel: string | null;
  exceedsDailyLimit: boolean;
  workedAfterShiftMinutes: number | null;
};

async function overtimeViews(teamId: string, where: Parameters<typeof prisma.overtimeRequest.findMany>[0]) {
  const tz = await getTeamTimezone(teamId);
  const [requests, names] = await Promise.all([
    prisma.overtimeRequest.findMany({ ...where, include: { user: { select: { name: true } } } }),
    namesFor(teamId),
  ]);
  if (requests.length === 0) return [];
  const pairs = requests.map((r) => ({ userId: r.userId, date: r.date }));
  const [records, assignments] = await Promise.all([
    prisma.attendanceRecord.findMany({ where: { OR: pairs } }),
    prisma.shiftAssignment.findMany({ where: { OR: pairs }, include: { shiftType: true } }),
  ]);
  return requests.map((r): OvertimeView => {
    const a = assignments.find((x) => x.userId === r.userId && x.date.getTime() === r.date.getTime()) ?? null;
    const rec = records.find((x) => x.userId === r.userId && x.date.getTime() === r.date.getTime()) ?? null;
    const schedule = scheduleOf(a, r.date, tz);
    const startAt = rec?.shiftStartAt ?? schedule?.startAt ?? null;
    const endAt = rec?.shiftEndAt ?? schedule?.endAt ?? null;
    const end = rec?.effectiveCheckOut ?? rec?.actualCheckOut ?? null;
    return {
      id: r.id,
      userId: r.userId,
      userName: r.user.name,
      date: dayKey(r.date),
      requestedMinutes: r.requestedMinutes,
      approvedMinutes: r.approvedMinutes,
      reason: r.reason,
      askedByName: r.askedById ? names.get(r.askedById) ?? null : null,
      publicHoliday: r.publicHoliday,
      submittedAfterShift: r.submittedAfterShift,
      status: r.status,
      reviewedByName: r.reviewedById ? names.get(r.reviewedById) ?? null : null,
      reviewedAt: iso(r.reviewedAt),
      reviewNote: r.reviewNote,
      createdAt: r.createdAt.toISOString(),
      scheduledLabel: schedule ? `${schedule.start} → ${schedule.end}` : null,
      exceedsDailyLimit: exceedsDailyLimit(startAt, endAt, r.approvedMinutes ?? r.requestedMinutes),
      workedAfterShiftMinutes: endAt && end ? minutesBetween(endAt, end) : null,
    };
  });
}

export async function getOvertimeBoard(scope: Scope) {
  const { teamId } = scope;
  const people = inSquad(scope);
  const since = new Date(Date.now() - 45 * DAY_MS);
  const [pending, decided] = await Promise.all([
    overtimeViews(teamId, { where: { teamId, user: people, status: "PENDING" }, orderBy: { date: "asc" } }),
    overtimeViews(teamId, { where: { teamId, user: people, status: { in: ["APPROVED", "REJECTED"] }, updatedAt: { gte: since } }, orderBy: { date: "desc" }, take: 60 }),
  ]);
  return { pending, decided };
}

export type PeriodRow = {
  userId: string;
  name: string;
  scheduledMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  extraMinutes: number;
  pendingMinutes: number;
  daysWorked: number;
  lateCount: number;
  missedPunches: number;
  needsReview: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  sickLeaveDays: number;
};

/** Hour buckets per employee for [start, end): scheduled, approved regular,
 *  approved overtime, pending, and unapproved extra are never mixed. */
export async function getPeriodSummary(scope: Scope, start: Date, end: Date, onlyUserId?: string) {
  const { teamId } = scope;
  // One person's summary (their profile) is reachable for Admin and HR from any team view.
  const people = onlyUserId ? reachable(scope) : inSquad(scope);
  const tz = await getTeamTimezone(teamId);
  await autoStopOpenSessions({ teamId });
  const userFilter = onlyUserId ? { id: onlyUserId } : {};
  const [employees, records, assignments, overtime] = await Promise.all([
    prisma.user.findMany({ where: { ...people, active: true, ...userFilter }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.attendanceRecord.findMany({ where: { date: { gte: start, lt: end }, user: { ...people, ...userFilter } } }),
    prisma.shiftAssignment.findMany({ where: { date: { gte: start, lt: end }, user: { ...people, ...userFilter } }, include: { shiftType: true } }),
    prisma.overtimeRequest.findMany({ where: { teamId, user: people, status: "APPROVED", date: { gte: start, lt: end }, ...(onlyUserId ? { userId: onlyUserId } : {}) } }),
  ]);

  return employees.map((u): PeriodRow => {
    const row: PeriodRow = {
      userId: u.id,
      name: u.name,
      scheduledMinutes: 0,
      regularMinutes: 0,
      overtimeMinutes: 0,
      extraMinutes: 0,
      pendingMinutes: 0,
      daysWorked: 0,
      lateCount: 0,
      missedPunches: 0,
      needsReview: 0,
      paidLeaveDays: 0,
      unpaidLeaveDays: 0,
      sickLeaveDays: 0,
    };
    for (const a of assignments.filter((x) => x.userId === u.id)) {
      if (a.status === "PAID_LEAVE") row.paidLeaveDays++;
      else if (a.status === "UNPAID_LEAVE") row.unpaidLeaveDays++;
      else if (a.status === "SICK_LEAVE") row.sickLeaveDays++;
      const s = scheduleOf(a, a.date, tz);
      if (s) row.scheduledMinutes += minutesBetween(s.startAt, s.endAt);
    }
    for (const r of records.filter((x) => x.userId === u.id)) {
      const ot = overtime
        .filter((o) => o.userId === u.id && o.date.getTime() === r.date.getTime())
        .reduce((s, o) => s + (o.approvedMinutes ?? o.requestedMinutes), 0);
      const c = creditFor(r, ot);
      if (c.bucket === "credited") {
        row.regularMinutes += c.regularMinutes;
        row.overtimeMinutes += c.overtimeMinutes;
        row.extraMinutes += c.extraMinutes;
        if (c.workedMinutes > 0) row.daysWorked++;
      } else if (c.bucket === "pending") {
        row.pendingMinutes += c.regularMinutes + c.overtimeMinutes;
      }
      if ((r.lateMinutes ?? 0) > 0 || r.missedCheckIn) row.lateCount++;
      if (r.missedCheckIn || r.missedCheckOut) row.missedPunches++;
      if (r.review === "PENDING") row.needsReview++;
    }
    return row;
  });
}

export function monthRange(year: number, month: number) {
  return { start: new Date(Date.UTC(year, month, 1)), end: new Date(Date.UTC(year, month + 1, 1)) };
}

export async function weekRange(teamId: string, anyInstant: Date) {
  const tz = await getTeamTimezone(teamId);
  const start = startOfWeekMonday(anyInstant, tz);
  return { start, end: new Date(start.getTime() + 7 * DAY_MS) };
}

/** One person's recent shifts (incl. missed scheduled days), newest first. */
export async function getEmployeeShifts(scope: Scope, userId: string, days = 45) {
  const { teamId } = scope;
  const people = reachable(scope);
  const tz = await getTeamTimezone(teamId);
  const now = new Date();
  const today = startOfDayUTC(now, tz);
  const since = new Date(today.getTime() - days * DAY_MS);
  const user = await prisma.user.findFirst({ where: { id: userId, ...reachable(scope) }, select: { id: true, name: true } });
  if (!user) return null;
  const [records, assignments, overtime, names] = await Promise.all([
    prisma.attendanceRecord.findMany({ where: { userId, date: { gte: since } } }),
    prisma.shiftAssignment.findMany({ where: { userId, date: { gte: since, lte: today } }, include: { shiftType: true } }),
    prisma.overtimeRequest.findMany({ where: { userId, date: { gte: since } } }),
    namesFor(teamId),
  ]);
  const dates = new Set<number>([...records.map((r) => r.date.getTime()), ...assignments.filter((a) => a.status === "WORKING").map((a) => a.date.getTime())]);
  const views = Array.from(dates)
    .sort((a, b) => b - a)
    .map((t) => {
      const date = new Date(t);
      return buildView({
        user,
        date,
        record: records.find((r) => r.date.getTime() === t) ?? null,
        assignment: assignments.find((a) => a.date.getTime() === t) ?? null,
        overtime: overtime.filter((o) => o.date.getTime() === t),
        names,
        tz,
        now,
      });
    })
    // A future-today scheduled shift that hasn't started isn't history yet.
    .filter((v) => v.state !== "NOT_STARTED" && v.state !== "OFF");
  return { user, shifts: views };
}

export async function getMyOvertime(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { teamId: true } });
  return overtimeViews(user.teamId, { where: { userId }, orderBy: { date: "desc" }, take: 30 });
}

/** Everything the review dialog needs about one shift. */
export async function getReviewContext(scope: Scope, ref: { recordId?: string | null; userId?: string | null; date?: string | null }) {
  const { teamId } = scope;
  const people = reachable(scope);
  const tz = await getTeamTimezone(teamId);
  const now = new Date();
  let record: AttendanceRecord | null = null;
  let userId = ref.userId ?? null;
  let date: Date | null = ref.date && /^\d{4}-\d{2}-\d{2}$/.test(ref.date) ? new Date(`${ref.date}T00:00:00.000Z`) : null;
  if (ref.recordId) {
    record = await prisma.attendanceRecord.findFirst({ where: { id: ref.recordId, user: people } });
    if (!record) return null;
    userId = record.userId;
    date = record.date;
  }
  if (!userId || !date) return null;
  const user = await prisma.user.findFirst({ where: { id: userId, ...reachable(scope) }, select: { id: true, name: true } });
  if (!user) return null;
  if (!record) record = await prisma.attendanceRecord.findUnique({ where: { userId_date: { userId, date } } });

  const [assignment, overtime, names, tasks, audits] = await Promise.all([
    prisma.shiftAssignment.findUnique({ where: { userId_date: { userId, date } }, include: { shiftType: true } }),
    prisma.overtimeRequest.findMany({ where: { userId, date } }),
    namesFor(teamId),
    prisma.task.findMany({
      where: { teamId, assignedUserId: userId, date, isRecurringTemplate: false, deletedAt: null },
      select: { id: true, title: true, status: true, dueTime: true },
      orderBy: [{ startTime: "asc" }, { createdAt: "asc" }],
    }),
    record
      ? prisma.attendanceAudit.findMany({ where: { recordId: record.id }, orderBy: { createdAt: "desc" }, take: 20 })
      : Promise.resolve([]),
  ]);
  const view = buildView({ user, date, record, assignment, overtime, names, tz, now });
  return {
    shift: view,
    tasks,
    overtime: overtime.map((o) => ({ id: o.id, status: o.status, requestedMinutes: o.requestedMinutes, approvedMinutes: o.approvedMinutes, reason: o.reason })),
    audits: audits.map((a) => ({
      id: a.id,
      action: a.action,
      actorName: a.actorId === "system" ? "System" : names.get(a.actorId) ?? "Unknown",
      note: a.note,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

export type ShiftCardState =
  | { kind: "ready"; next: { date: string; shiftName: string | null; start: string; end: string; startAt: string; endAt: string } | null; capHours: number }
  | { kind: "working"; shift: RecordView; autoStopAt: string; capHours: number }
  | { kind: "auto_stopped"; shift: RecordView; capHours: number }
  | { kind: "blocked"; blocking: RecordView; request: RecordView | null; capHours: number }
  | { kind: "done"; shift: RecordView; next: { date: string; shiftName: string | null; start: string; end: string; startAt: string; endAt: string } | null; capHours: number };

/** What the employee's own shift card should show right now. */
export async function getShiftCardState(userId: string): Promise<ShiftCardState> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, name: true, teamId: true, team: { select: { timezone: true, settings: { select: { autoCheckoutHours: true } } } } },
  });
  const tz = user.team.timezone;
  const capHours = user.team.settings?.autoCheckoutHours ?? 10;
  await autoStopOpenSessions({ userId });
  const now = new Date();
  const today = startOfDayUTC(now, tz);
  const names = await namesFor(user.teamId);

  const recent = await prisma.attendanceRecord.findMany({
    where: { userId, OR: [{ date: { gte: new Date(today.getTime() - DAY_MS) } }, { review: "PENDING", blocksCheckIn: true }] },
    orderBy: { date: "desc" },
  });
  const datesNeeded = Array.from(new Set(recent.map((r) => r.date.getTime()))).map((t) => new Date(t));
  const [assignments, overtime, upcoming] = await Promise.all([
    prisma.shiftAssignment.findMany({ where: { userId, date: { in: datesNeeded } }, include: { shiftType: true } }),
    prisma.overtimeRequest.findMany({ where: { userId, date: { in: datesNeeded } } }),
    prisma.shiftAssignment.findMany({
      where: { userId, status: "WORKING", date: { gte: new Date(today.getTime() - DAY_MS), lte: new Date(today.getTime() + 7 * DAY_MS) } },
      include: { shiftType: true },
      orderBy: { date: "asc" },
    }),
  ]);
  const view = (r: AttendanceRecord) =>
    buildView({
      user,
      date: r.date,
      record: r,
      assignment: assignments.find((a) => a.date.getTime() === r.date.getTime()) ?? null,
      overtime: overtime.filter((o) => o.date.getTime() === r.date.getTime()),
      names,
      tz,
      now,
    });

  const workedDays = new Set(recent.filter((r) => r.actualCheckIn || r.checkInRequestedAt).map((r) => r.date.getTime()));
  const nextShift = upcoming
    .filter((a) => !workedDays.has(a.date.getTime()))
    .map((a) => ({ a, s: scheduleOf(a, a.date, tz) }))
    .find(({ s }) => s && s.endAt.getTime() > now.getTime());
  const next = nextShift?.s
    ? {
        date: dayKey(nextShift.a.date),
        shiftName: nextShift.a.shiftType?.name ?? null,
        start: nextShift.s.start,
        end: nextShift.s.end,
        startAt: nextShift.s.startAt.toISOString(),
        endAt: nextShift.s.endAt.toISOString(),
      }
    : null;

  const open = recent.find((r) => r.actualCheckIn && !r.actualCheckOut && !r.autoClosedAt && (r.review === "NONE" || r.review === "PENDING"));
  if (open) {
    const v = view(open);
    const stop = autoStopAt({ checkIn: open.actualCheckIn!, shiftEndAt: open.shiftEndAt, approvedOvertimeMinutes: v.overtimeApprovedMinutes, capHours });
    return { kind: "working", shift: v, autoStopAt: stop.toISOString(), capHours };
  }

  const stoppedUnconfirmed = recent.find((r) => r.autoClosedAt && !r.reportedCheckOutAt && r.review === "PENDING");
  if (stoppedUnconfirmed) return { kind: "auto_stopped", shift: view(stoppedUnconfirmed), capHours };

  const blocking = recent.filter((r) => r.blocksCheckIn && r.review === "PENDING").sort((a, b) => a.date.getTime() - b.date.getTime())[0];
  if (blocking) {
    const request = recent.find((r) => r.checkInRequestedAt && !r.actualCheckIn && r.review === "PENDING");
    return { kind: "blocked", blocking: view(blocking), request: request ? view(request) : null, capHours };
  }

  const pendingRequest = recent.find((r) => r.checkInRequestedAt && !r.actualCheckIn && r.review === "PENDING");
  if (pendingRequest) return { kind: "blocked", blocking: view(pendingRequest), request: view(pendingRequest), capHours };

  // Most recent finished shift from today/yesterday — shown until the next
  // shift's check-in window opens.
  const done = recent.find((r) => r.actualCheckIn && (r.actualCheckOut || r.reportedCheckOutAt || r.review === "APPROVED"));
  const nextWindowOpen = next ? now.getTime() >= new Date(next.startAt).getTime() - 4 * 60 * 60 * 1000 : false;
  if (done && !nextWindowOpen && done.date.getTime() >= today.getTime() - DAY_MS) {
    return { kind: "done", shift: view(done), next, capHours };
  }
  return { kind: "ready", next, capHours };
}

/** Today's team presence for the dashboard widget. */
export async function getTodayPresence(scope: Scope) {
  const { teamId } = scope;
  const people = inSquad(scope);
  const tz = await getTeamTimezone(teamId);
  const today = startOfDayUTC(new Date(), tz);
  return getTeamDay(scope, today);
}
