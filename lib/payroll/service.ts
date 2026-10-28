import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getTeamTimezone } from "@/lib/team-timezone";
import { creditFor, shiftWindow } from "@/lib/attendance/rules";
import { calculatePayroll, type PayrollBreakdown, type PayrollRules } from "./calc";

// Monthly payroll from approved attendance. DRAFT runs are recalculated on
// every view (so late approvals flow in); FINALIZED runs are frozen copies.
// A month can't be finalized while any shift still needs review — payroll
// only ever pays confirmed time.

export class PayrollError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export async function payrollRules(teamId: string): Promise<PayrollRules & { currency: string }> {
  const s = await prisma.teamSettings.findUnique({ where: { teamId } });
  return {
    currency: s?.currency ?? "BDT",
    otMultiplier: s?.otMultiplier ?? 1.5,
    holidayOtMultiplier: s?.holidayOtMultiplier ?? 2,
    otBase: s?.otBase === "GROSS" ? "GROSS" : "BASIC",
    otHoursPerMonth: s?.otHoursPerMonth ?? 208,
    dailyRateDivisor: s?.dailyRateDivisor ?? 30,
    lateDaysPerDeduction: s?.lateDaysPerDeduction ?? 0,
  };
}

const monthRange = (year: number, month: number) => ({ start: new Date(Date.UTC(year, month, 1)), end: new Date(Date.UTC(year, month + 1, 1)) });

type Inputs = { overtimeMinutes: number; holidayOvertimeMinutes: number; unpaidLeaveDays: number; absentDays: number; lateCount: number; unresolved: number };

/** Attendance facts per employee for the month. */
async function monthInputs(teamId: string, year: number, month: number) {
  const { start, end } = monthRange(year, month);
  const tz = await getTeamTimezone(teamId);
  const [records, assignments, overtime] = await Promise.all([
    prisma.attendanceRecord.findMany({ where: { date: { gte: start, lt: end }, user: { teamId } } }),
    prisma.shiftAssignment.findMany({ where: { date: { gte: start, lt: end }, user: { teamId } }, include: { shiftType: true } }),
    prisma.overtimeRequest.findMany({ where: { teamId, status: "APPROVED", date: { gte: start, lt: end } } }),
  ]);
  const out = new Map<string, Inputs>();
  const get = (userId: string) => {
    let v = out.get(userId);
    if (!v) out.set(userId, (v = { overtimeMinutes: 0, holidayOvertimeMinutes: 0, unpaidLeaveDays: 0, absentDays: 0, lateCount: 0, unresolved: 0 }));
    return v;
  };
  const key = (u: string, d: Date) => `${u}:${d.getTime()}`;
  const recordByKey = new Map(records.map((r) => [key(r.userId, r.date), r]));

  for (const r of records) {
    const v = get(r.userId);
    const dayOt = overtime.filter((o) => o.userId === r.userId && o.date.getTime() === r.date.getTime());
    const approved = dayOt.reduce((s, o) => s + (o.approvedMinutes ?? o.requestedMinutes), 0);
    const credit = creditFor(r, approved);
    if (credit.bucket === "credited") {
      if (dayOt.some((o) => o.publicHoliday)) v.holidayOvertimeMinutes += credit.overtimeMinutes;
      else v.overtimeMinutes += credit.overtimeMinutes;
    }
    if (r.review === "PENDING") v.unresolved++;
    if (r.review === "REJECTED" && !r.actualCheckIn) v.absentDays++;
    if ((r.lateMinutes ?? 0) > 0 || r.missedCheckIn) v.lateCount++;
  }

  const now = Date.now();
  for (const a of assignments) {
    const v = get(a.userId);
    if (a.status === "UNPAID_LEAVE") v.unpaidLeaveDays++;
    if (a.status !== "WORKING") continue;
    // A scheduled shift that ended with nothing recorded and nothing decided.
    const start = a.customStart ?? a.shiftType?.startTime;
    const endTime = a.customEnd ?? a.shiftType?.endTime;
    if (!start || !endTime || shiftWindow(a.date, start, endTime, tz).endAt.getTime() > now) continue;
    const r = recordByKey.get(key(a.userId, a.date));
    if (!r || (!r.actualCheckIn && r.review === "NONE" && !r.checkInRequestedAt)) v.unresolved++;
  }
  return out;
}

export type PayrollRow = {
  userId: string;
  name: string;
  hasSalary: boolean;
  monthlyGross: number | null;
  basicPercent: number | null;
  breakdown: PayrollBreakdown | null;
  adjustmentNote: string | null;
  unresolved: number;
  /** Their team inside the company, for the per-team breakdown. */
  team: string | null;
  squadId: string | null;
};

/** One company-wide run per month. `squadId` only narrows what's shown (the
 *  team switcher); finalizing and reopening always cover the whole company. */
export async function getPayroll(teamId: string, year: number, month: number, squadId: string | null = null) {
  const rules = await payrollRules(teamId);
  const run = await prisma.payrollRun.findUnique({ where: { teamId_year_month: { teamId, year, month } }, include: { lines: true } });

  const people = await prisma.user.findMany({ where: { teamId, active: true }, include: { salary: true, squad: { select: { name: true } } }, orderBy: { name: "asc" } });
  const shown = (rows: PayrollRow[]) => (squadId ? rows.filter((r) => r.squadId === squadId) : rows);

  if (run?.status === "FINALIZED") {
    const everyone = await prisma.user.findMany({ where: { teamId }, select: { id: true, name: true, squadId: true, squad: { select: { name: true } } } });
    const byId = new Map(everyone.map((u) => [u.id, u]));
    const rows: PayrollRow[] = run.lines.map((l) => {
      const details = l.details as unknown as PayrollBreakdown & { adjustmentNote?: string; monthlyGross: number; basicPercent: number };
      const u = byId.get(l.userId);
      return { userId: l.userId, name: u?.name ?? "Former employee", team: u?.squad?.name ?? null, squadId: u?.squadId ?? null, hasSalary: true, monthlyGross: details.monthlyGross, basicPercent: details.basicPercent, breakdown: details, adjustmentNote: details.adjustmentNote ?? null, unresolved: 0 };
    });
    return { rules, status: "FINALIZED" as const, finalizedAt: run.finalizedAt?.toISOString() ?? null, rows: shown(rows).sort((a, b) => a.name.localeCompare(b.name)) };
  }

  const inputs = await monthInputs(teamId, year, month);
  const adjustments = new Map((run?.lines ?? []).map((l) => [l.userId, { amount: l.adjustment, note: (l.details as any)?.adjustmentNote ?? null }]));
  const rows: PayrollRow[] = people.map((p) => {
    const i = inputs.get(p.id) ?? { overtimeMinutes: 0, holidayOvertimeMinutes: 0, unpaidLeaveDays: 0, absentDays: 0, lateCount: 0, unresolved: 0 };
    const adj = adjustments.get(p.id);
    return {
      userId: p.id,
      name: p.name,
      team: p.squad?.name ?? null,
      squadId: p.squadId,
      hasSalary: !!p.salary,
      monthlyGross: p.salary?.monthlyGross ?? null,
      basicPercent: p.salary?.basicPercent ?? null,
      breakdown: p.salary ? calculatePayroll(rules, { monthlyGross: p.salary.monthlyGross, basicPercent: p.salary.basicPercent, ...i, adjustment: adj?.amount ?? 0 }) : null,
      adjustmentNote: adj?.note ?? null,
      unresolved: i.unresolved,
    };
  });
  return { rules, status: "DRAFT" as const, finalizedAt: null, rows: shown(rows) };
}

async function draftRun(teamId: string, year: number, month: number) {
  const run = await prisma.payrollRun.upsert({
    where: { teamId_year_month: { teamId, year, month } },
    update: {},
    create: { teamId, year, month },
  });
  if (run.status === "FINALIZED") throw new PayrollError("This month is finalized. Reopen it first to make changes.", 409);
  return run;
}

export async function setAdjustment(teamId: string, year: number, month: number, userId: string, amount: number, note: string | null) {
  const user = await prisma.user.findFirst({ where: { id: userId, teamId } });
  if (!user) throw new PayrollError("Employee not found.", 404);
  const run = await draftRun(teamId, year, month);
  const details = { adjustmentNote: note?.trim() || null } as Prisma.InputJsonValue;
  await prisma.payrollLine.upsert({
    where: { runId_userId: { runId: run.id, userId } },
    update: { adjustment: Math.round(amount), details },
    create: { runId: run.id, userId, gross: 0, basic: 0, otPay: 0, deductions: 0, net: 0, adjustment: Math.round(amount), details },
  });
}

export async function finalizePayroll(teamId: string, actorId: string, year: number, month: number) {
  const payroll = await getPayroll(teamId, year, month);
  if (payroll.status === "FINALIZED") throw new PayrollError("Already finalized.", 409);
  const unresolved = payroll.rows.reduce((s, r) => s + r.unresolved, 0);
  if (unresolved > 0) {
    throw new PayrollError(`${unresolved} shift(s) this month still need review in Team Attendance. Resolve them first so payroll only pays confirmed time.`, 409);
  }
  const paid = payroll.rows.filter((r) => r.breakdown);
  if (paid.length === 0) throw new PayrollError("No employee has a salary set yet.");
  const run = await draftRun(teamId, year, month);
  await prisma.$transaction([
    prisma.payrollLine.deleteMany({ where: { runId: run.id } }),
    prisma.payrollLine.createMany({
      data: paid.map((r) => ({
        runId: run.id,
        userId: r.userId,
        gross: r.breakdown!.gross,
        basic: r.breakdown!.basic,
        otPay: r.breakdown!.otPay,
        deductions: r.breakdown!.deductions,
        adjustment: r.breakdown!.adjustment,
        net: r.breakdown!.net,
        details: { ...r.breakdown!, monthlyGross: r.monthlyGross, basicPercent: r.basicPercent, adjustmentNote: r.adjustmentNote } as Prisma.InputJsonValue,
      })),
    }),
    prisma.payrollRun.update({ where: { id: run.id }, data: { status: "FINALIZED", finalizedBy: actorId, finalizedAt: new Date() } }),
  ]);
}

export async function reopenPayroll(teamId: string, year: number, month: number) {
  const result = await prisma.payrollRun.updateMany({ where: { teamId, year, month, status: "FINALIZED" }, data: { status: "DRAFT", finalizedBy: null, finalizedAt: null } });
  if (result.count === 0) throw new PayrollError("This month isn't finalized.", 409);
}

export async function upsertSalary(teamId: string, actorId: string, userId: string, monthlyGross: number, basicPercent: number) {
  const user = await prisma.user.findFirst({ where: { id: userId, teamId } });
  if (!user) throw new PayrollError("Employee not found.", 404);
  return prisma.employeeSalary.upsert({
    where: { userId },
    update: { monthlyGross, basicPercent, updatedById: actorId },
    create: { userId, monthlyGross, basicPercent, updatedById: actorId },
  });
}
