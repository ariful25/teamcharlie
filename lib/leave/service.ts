import { Prisma, type LeaveType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getTeamTimezone } from "@/lib/team-timezone";
import { startOfDayUTC } from "@/lib/time";
import { canReview } from "@/lib/attendance/rules";
import { AttendanceError } from "@/lib/services/attendance";

// Leave requests → approval → Shift Schedule. Approving writes PAID_LEAVE /
// UNPAID_LEAVE / SICK_LEAVE onto each day's ShiftAssignment, which is what
// attendance, payroll and the roster already read; the previous schedule is
// kept on the request so revoking restores it exactly.

const DAY = 24 * 60 * 60 * 1000;
const STATUS_FOR: Record<LeaveType, "PAID_LEAVE" | "UNPAID_LEAVE" | "SICK_LEAVE"> = {
  PAID: "PAID_LEAVE",
  UNPAID: "UNPAID_LEAVE",
  SICK: "SICK_LEAVE",
};

type Actor = { id: string; name: string; role: string; teamId: string };
type Replaced = { date: string; existed: boolean; status: string | null; shiftTypeId: string | null; customStart: string | null; customEnd: string | null };

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const parseDay = (key: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new AttendanceError("INVALID_DATE", "Pick valid dates.");
  return new Date(`${key}T00:00:00.000Z`);
};

function daysBetween(start: Date, end: Date) {
  const out: Date[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += DAY) out.push(new Date(t));
  return out;
}

/** Days the leave actually covers — days the schedule marks as weekend don't count. */
async function countableDays(userId: string, start: Date, end: Date) {
  const days = daysBetween(start, end);
  const weekends = await prisma.shiftAssignment.findMany({
    where: { userId, date: { gte: start, lte: end }, status: "WEEKEND" },
    select: { date: true },
  });
  const off = new Set(weekends.map((w) => w.date.getTime()));
  return days.filter((d) => !off.has(d.getTime()));
}

export async function leaveBalances(userId: string, teamId: string, year: number) {
  const settings = await prisma.teamSettings.findUnique({ where: { teamId } });
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year + 1, 0, 1));
  const requests = await prisma.leaveRequest.findMany({
    where: { userId, status: { in: ["APPROVED", "PENDING"] }, startDate: { gte: from, lt: to } },
    select: { type: true, status: true, days: true },
  });
  const sum = (type: LeaveType, status: string) => requests.filter((r) => r.type === type && r.status === status).reduce((s, r) => s + r.days, 0);
  return {
    PAID: { allowance: settings?.paidLeavePerYear ?? 10, used: sum("PAID", "APPROVED"), pending: sum("PAID", "PENDING") },
    SICK: { allowance: settings?.sickLeavePerYear ?? 14, used: sum("SICK", "APPROVED"), pending: sum("SICK", "PENDING") },
    UNPAID: { allowance: null as number | null, used: sum("UNPAID", "APPROVED"), pending: sum("UNPAID", "PENDING") },
  };
}

export async function requestLeave(actor: Actor, input: { type: LeaveType; startDate: string; endDate: string; reason: string }) {
  const start = parseDay(input.startDate);
  const end = parseDay(input.endDate);
  if (end < start) throw new AttendanceError("INVALID_DATES", "The end date is before the start date.");
  if ((end.getTime() - start.getTime()) / DAY >= 31) throw new AttendanceError("TOO_LONG", "Request at most 31 days at a time.");
  if (input.reason.trim().length < 3) throw new AttendanceError("REASON_REQUIRED", "Add a short reason.");

  const today = startOfDayUTC(new Date(), await getTeamTimezone(actor.teamId));
  // Sick leave is often reported after the fact; other leave is planned.
  const earliest = input.type === "SICK" ? today.getTime() - 14 * DAY : today.getTime();
  if (start.getTime() < earliest) {
    throw new AttendanceError("PAST_DATE", input.type === "SICK" ? "Sick leave can be reported up to 14 days back." : "Leave can't start in the past.");
  }

  const overlap = await prisma.leaveRequest.findFirst({
    where: { userId: actor.id, status: { in: ["PENDING", "APPROVED"] }, startDate: { lte: end }, endDate: { gte: start } },
  });
  if (overlap) throw new AttendanceError("OVERLAP", "You already have leave requested for some of those days.");

  const days = (await countableDays(actor.id, start, end)).length;
  if (days === 0) throw new AttendanceError("NO_DAYS", "Those days are all weekend days on your schedule.");

  if (input.type !== "UNPAID") {
    const b = (await leaveBalances(actor.id, actor.teamId, start.getUTCFullYear()))[input.type];
    const left = (b.allowance ?? 0) - b.used - b.pending;
    if (days > left) {
      throw new AttendanceError("NO_BALANCE", `Only ${Math.max(0, left)} ${input.type === "PAID" ? "paid" : "sick"} leave day(s) left this year (incl. pending). Request unpaid leave for the rest.`);
    }
  }

  return prisma.leaveRequest.create({
    data: { teamId: actor.teamId, userId: actor.id, type: input.type, startDate: start, endDate: end, days, reason: input.reason.trim() },
  });
}

export async function reviewLeave(reviewer: Actor, id: string, input: { action: "APPROVE" | "REJECT" | "REVOKE"; note?: string | null }) {
  const request = await prisma.leaveRequest.findFirst({ where: { id, teamId: reviewer.teamId } });
  if (!request) throw new AttendanceError("NOT_FOUND", "Leave request not found.", 404);
  if (!canReview(reviewer, request.userId)) {
    throw new AttendanceError("SELF_REVIEW", "You can't approve your own leave. Ask another team lead or an admin.", 403);
  }
  const selfTag = reviewer.id === request.userId ? "[self-approved] " : "";
  const note = `${selfTag}${input.note?.trim() ?? ""}`.trim() || null;

  if (input.action === "REJECT") {
    if (request.status !== "PENDING") throw new AttendanceError("CLOSED", "Only pending requests can be rejected.", 409);
    if (!input.note?.trim()) throw new AttendanceError("NOTE_REQUIRED", "Add a short note explaining the rejection.");
    return prisma.leaveRequest.update({ where: { id }, data: { status: "REJECTED", reviewedById: reviewer.id, reviewedAt: new Date(), reviewNote: note } });
  }

  if (input.action === "REVOKE") {
    if (request.status !== "APPROVED") throw new AttendanceError("CLOSED", "Only approved leave can be revoked.", 409);
    if (!input.note?.trim()) throw new AttendanceError("NOTE_REQUIRED", "Add a note explaining why the leave is revoked.");
    const replaced = (request.replaced as Replaced[] | null) ?? [];
    return prisma.$transaction(async (tx) => {
      for (const r of replaced) {
        const date = new Date(`${r.date}T00:00:00.000Z`);
        if (!r.existed) {
          await tx.shiftAssignment.deleteMany({ where: { userId: request.userId, date } });
        } else {
          await tx.shiftAssignment.update({
            where: { userId_date: { userId: request.userId, date } },
            data: { status: (r.status as any) ?? "WORKING", shiftTypeId: r.shiftTypeId, customStart: r.customStart, customEnd: r.customEnd },
          });
        }
      }
      return tx.leaveRequest.update({ where: { id }, data: { status: "CANCELLED", reviewedById: reviewer.id, reviewedAt: new Date(), reviewNote: `Revoked: ${note}` } });
    });
  }

  // APPROVE
  if (request.status !== "PENDING") throw new AttendanceError("CLOSED", "This request was already decided.", 409);
  const days = await countableDays(request.userId, request.startDate, request.endDate);
  const worked = await prisma.attendanceRecord.findFirst({
    where: { userId: request.userId, date: { in: days }, actualCheckIn: { not: null } },
    select: { date: true },
  });
  if (worked) throw new AttendanceError("WORKED", `They checked in on ${dayKey(worked.date)} . Adjust the dates before approving.`, 409);

  const existing = await prisma.shiftAssignment.findMany({ where: { userId: request.userId, date: { in: days } } });
  const replaced: Replaced[] = days.map((d) => {
    const a = existing.find((e) => e.date.getTime() === d.getTime());
    return { date: dayKey(d), existed: !!a, status: a?.status ?? null, shiftTypeId: a?.shiftTypeId ?? null, customStart: a?.customStart ?? null, customEnd: a?.customEnd ?? null };
  });
  const status = STATUS_FOR[request.type];

  return prisma.$transaction(async (tx) => {
    for (const d of days) {
      await tx.shiftAssignment.upsert({
        where: { userId_date: { userId: request.userId, date: d } },
        update: { status },
        create: { userId: request.userId, date: d, status, createdBy: reviewer.id, note: "Approved leave" },
      });
    }
    return tx.leaveRequest.update({
      where: { id },
      data: { status: "APPROVED", reviewedById: reviewer.id, reviewedAt: new Date(), reviewNote: note, days: days.length, replaced: replaced as unknown as Prisma.InputJsonValue },
    });
  });
}

export async function cancelLeave(actor: Actor, id: string) {
  const result = await prisma.leaveRequest.updateMany({ where: { id, userId: actor.id, teamId: actor.teamId, status: "PENDING" }, data: { status: "CANCELLED" } });
  if (result.count === 0) throw new AttendanceError("NOT_FOUND", "Only your own pending requests can be cancelled.", 404);
}

export type LeaveView = {
  id: string;
  userId: string;
  userName: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: string;
  reviewedByName: string | null;
  reviewNote: string | null;
  createdAt: string;
};

export async function leaveViews(teamId: string, where: Prisma.LeaveRequestWhereInput, take = 60): Promise<LeaveView[]> {
  const [rows, people] = await Promise.all([
    prisma.leaveRequest.findMany({ where: { teamId, ...where }, include: { user: { select: { name: true } } }, orderBy: { startDate: "desc" }, take }),
    prisma.user.findMany({ where: { teamId }, select: { id: true, name: true } }),
  ]);
  const names = new Map(people.map((p) => [p.id, p.name]));
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.user.name,
    type: r.type,
    startDate: dayKey(r.startDate),
    endDate: dayKey(r.endDate),
    days: r.days,
    reason: r.reason,
    status: r.status,
    reviewedByName: r.reviewedById ? names.get(r.reviewedById) ?? null : null,
    reviewNote: r.reviewNote,
    createdAt: r.createdAt.toISOString(),
  }));
}
