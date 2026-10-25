import { prisma } from "@/lib/prisma";
import { startOfDayUTC } from "@/lib/time";
import { canReview, shiftWindow } from "@/lib/attendance/rules";
import { AttendanceError } from "@/lib/services/attendance";

// Overtime only counts when it's approved here (docs/attendance-rules.md,
// rule 7). The credited amount on a shift is the time actually worked after
// the scheduled end, capped at the approved minutes — see creditFor().

const DAY_MS = 24 * 60 * 60 * 1000;
export const OVERTIME_MIN_MINUTES = 15;
export const OVERTIME_MAX_MINUTES = 8 * 60;

type Actor = { id: string; name: string; role: string; teamId: string };

const isLead = (role: string) => role === "ADMIN" || role === "TEAM_LEAD";

/** Scheduled end of (user, day), if they're scheduled — used to tell whether a
 *  request came in after the shift was already over. */
async function shiftEndFor(userId: string, date: Date, tz: string) {
  const record = await prisma.attendanceRecord.findUnique({ where: { userId_date: { userId, date } }, select: { shiftEndAt: true } });
  if (record?.shiftEndAt) return record.shiftEndAt;
  const a = await prisma.shiftAssignment.findUnique({ where: { userId_date: { userId, date } }, include: { shiftType: true } });
  const start = a?.status === "WORKING" ? a.customStart ?? a.shiftType?.startTime : null;
  const end = a?.status === "WORKING" ? a.customEnd ?? a.shiftType?.endTime : null;
  return start && end ? shiftWindow(date, start, end, tz).endAt : null;
}

export async function createOvertimeRequest(
  actor: Actor,
  input: { userId?: string | null; date: string; minutes: number; reason: string; askedById?: string | null; publicHoliday?: boolean; approveNow?: boolean }
) {
  const targetId = input.userId || actor.id;
  if (targetId !== actor.id && !isLead(actor.role)) {
    throw new AttendanceError("FORBIDDEN", "Only a team lead or admin can add overtime for someone else.", 403);
  }
  const target = await prisma.user.findFirst({ where: { id: targetId, teamId: actor.teamId, active: true } });
  if (!target) throw new AttendanceError("NOT_FOUND", "Employee not found.", 404);
  if (input.approveNow && !canReview(actor, targetId)) {
    throw new AttendanceError("SELF_REVIEW", "You can't pre-approve your own overtime. Ask another team lead or an admin.", 403);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new AttendanceError("INVALID_DATE", "Pick a valid date.");
  if (!Number.isInteger(input.minutes) || input.minutes < OVERTIME_MIN_MINUTES || input.minutes > OVERTIME_MAX_MINUTES) {
    throw new AttendanceError("INVALID_MINUTES", `Overtime must be between ${OVERTIME_MIN_MINUTES} minutes and ${OVERTIME_MAX_MINUTES / 60} hours.`);
  }
  if (input.reason.trim().length < 5) throw new AttendanceError("REASON_REQUIRED", "Explain what the overtime is for.");

  const team = await prisma.team.findUniqueOrThrow({ where: { id: actor.teamId }, select: { timezone: true } });
  const date = new Date(`${input.date}T00:00:00.000Z`);
  const today = startOfDayUTC(new Date(), team.timezone);
  if (date.getTime() < today.getTime() - 14 * DAY_MS || date.getTime() > today.getTime() + 31 * DAY_MS) {
    throw new AttendanceError("INVALID_DATE", "Overtime can be requested from 14 days back up to a month ahead.");
  }

  if (input.askedById) {
    const asker = await prisma.user.findFirst({ where: { id: input.askedById, teamId: actor.teamId, role: { in: ["ADMIN", "TEAM_LEAD"] } } });
    if (!asker) throw new AttendanceError("INVALID_ASKER", "“Asked by” must be a team lead or admin on your team.");
  }

  const active = await prisma.overtimeRequest.findFirst({
    where: { userId: targetId, date, status: { in: ["PENDING", "APPROVED"] } },
  });
  if (active) {
    throw new AttendanceError("DUPLICATE", "There's already an overtime request for that day. Cancel or update it instead.", 409);
  }

  const shiftEnd = await shiftEndFor(targetId, date, team.timezone);
  const submittedAfterShift = shiftEnd ? shiftEnd.getTime() < Date.now() : date.getTime() < today.getTime();
  const now = new Date();

  return prisma.overtimeRequest.create({
    data: {
      teamId: actor.teamId,
      userId: targetId,
      date,
      requestedMinutes: input.minutes,
      reason: input.reason.trim(),
      askedById: input.askedById || null,
      publicHoliday: !!input.publicHoliday,
      submittedAfterShift,
      createdById: actor.id,
      ...(input.approveNow
        ? {
            status: "APPROVED" as const,
            approvedMinutes: input.minutes,
            reviewedById: actor.id,
            reviewedAt: now,
            reviewNote: actor.id === targetId ? "[self-approved] Assigned by admin" : `Assigned by ${actor.name}`,
          }
        : {}),
    },
  });
}

export async function reviewOvertime(
  reviewer: Actor,
  id: string,
  input: { action: "APPROVE" | "REJECT"; approvedMinutes?: number | null; note?: string | null }
) {
  const request = await prisma.overtimeRequest.findFirst({ where: { id, teamId: reviewer.teamId } });
  if (!request) throw new AttendanceError("NOT_FOUND", "Overtime request not found.", 404);
  if (!canReview(reviewer, request.userId)) {
    throw new AttendanceError("SELF_REVIEW", "You can't approve your own overtime. Ask another team lead or an admin.", 403);
  }
  // Pending requests can be decided; an approved one can be revoked or have
  // its minutes changed (with a note) — never silently.
  if (request.status !== "PENDING" && request.status !== "APPROVED") {
    throw new AttendanceError("CLOSED", "This request is already closed.", 409);
  }
  if (request.status === "APPROVED" && !input.note?.trim()) {
    throw new AttendanceError("NOTE_REQUIRED", "Add a note when changing an approved request.");
  }
  if (input.action === "REJECT" && !input.note?.trim()) {
    throw new AttendanceError("NOTE_REQUIRED", "Add a short note explaining the rejection.");
  }
  const minutes = input.approvedMinutes ?? request.requestedMinutes;
  if (input.action === "APPROVE" && (!Number.isInteger(minutes) || minutes < OVERTIME_MIN_MINUTES || minutes > OVERTIME_MAX_MINUTES)) {
    throw new AttendanceError("INVALID_MINUTES", `Approve between ${OVERTIME_MIN_MINUTES} minutes and ${OVERTIME_MAX_MINUTES / 60} hours.`);
  }
  const selfTag = reviewer.id === request.userId ? "[self-approved] " : "";

  return prisma.overtimeRequest.update({
    where: { id },
    data: {
      status: input.action === "APPROVE" ? "APPROVED" : "REJECTED",
      approvedMinutes: input.action === "APPROVE" ? minutes : null,
      reviewedById: reviewer.id,
      reviewedAt: new Date(),
      reviewNote: `${selfTag}${input.note?.trim() ?? ""}`.trim() || null,
    },
  });
}

export async function cancelOvertime(actor: Actor, id: string) {
  const result = await prisma.overtimeRequest.updateMany({
    where: { id, userId: actor.id, teamId: actor.teamId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
  if (result.count === 0) throw new AttendanceError("NOT_FOUND", "Only your own pending requests can be cancelled.", 404);
}
