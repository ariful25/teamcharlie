import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserOrNull } from "@/lib/session";
import { permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PayrollError, finalizePayroll, getPayroll, reopenPayroll, setAdjustment, upsertSalary } from "@/lib/payroll/service";

// Payroll actions (admin only). One endpoint, one action per request.
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("salary"), userId: z.string(), monthlyGross: z.number().int().min(0).max(100_000_000), basicPercent: z.number().int().min(1).max(100) }),
  z.object({ action: z.literal("adjust"), year: z.number().int(), month: z.number().int().min(0).max(11), userId: z.string(), amount: z.number().int().min(-100_000_000).max(100_000_000), note: z.string().max(300).nullable().optional() }),
  z.object({ action: z.literal("finalize"), year: z.number().int(), month: z.number().int().min(0).max(11) }),
  z.object({ action: z.literal("reopen"), year: z.number().int(), month: z.number().int().min(0).max(11) }),
  z.object({
    action: z.literal("rules"),
    otMultiplier: z.number().min(1).max(5),
    holidayOtMultiplier: z.number().min(1).max(5),
    otBase: z.enum(["BASIC", "GROSS"]),
    otHoursPerMonth: z.number().int().min(100).max(400),
    dailyRateDivisor: z.number().int().min(20).max(31),
    lateDaysPerDeduction: z.number().int().min(0).max(31),
    currency: z.string().min(1).max(8),
  }),
]);

async function requireAdmin() {
  const user = await getCurrentUserOrNull();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!permissions.canManagePayroll(user.role)) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const d = parsed.data;
  const teamId = auth.user.teamId;
  try {
    if (d.action === "salary") await upsertSalary(teamId, auth.user.id, d.userId, d.monthlyGross, d.basicPercent);
    else if (d.action === "adjust") await setAdjustment(teamId, d.year, d.month, d.userId, d.amount, d.note ?? null);
    else if (d.action === "finalize") await finalizePayroll(teamId, auth.user.id, d.year, d.month);
    else if (d.action === "reopen") await reopenPayroll(teamId, d.year, d.month);
    else {
      const { action: _a, ...rules } = d;
      await prisma.teamSettings.upsert({ where: { teamId }, update: rules, create: { teamId, ...rules } });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof PayrollError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Payroll action failed." }, { status: 500 });
  }
}

const cell = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// CSV export of a month: ?year=2026&month=9 (0-based).
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const year = Number(req.nextUrl.searchParams.get("year"));
  const month = Number(req.nextUrl.searchParams.get("month"));
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 0 || month > 11) return NextResponse.json({ error: "Bad month" }, { status: 400 });
  const payroll = await getPayroll(auth.user.teamId, year, month);
  const header = ["Employee", "Gross", "Basic", "OT hours", "Holiday OT hours", "OT pay", "Unpaid leave days", "Absent days", "Late count", "Deductions", "Adjustment", "Adjustment note", "Net", "Status"];
  const lines = payroll.rows
    .filter((r) => r.breakdown)
    .map((r) => {
      const b = r.breakdown!;
      return [r.name, b.gross, b.basic, b.overtimeHours, b.holidayOvertimeHours, b.otPay, b.unpaidLeaveDays, b.absentDays, b.lateCount, b.deductions, b.adjustment, r.adjustmentNote, b.net, payroll.status].map(cell).join(",");
    });
  return new NextResponse([header.join(","), ...lines].join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payroll-${year}-${String(month + 1).padStart(2, "0")}.csv"`,
    },
  });
}
