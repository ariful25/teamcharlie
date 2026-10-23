// Pure payroll maths — no I/O, covered by scripts/test-payroll.ts.
// All money is whole currency units (e.g. taka), rounded at each line item.

export type PayrollRules = {
  otMultiplier: number; // e.g. 1.5
  holidayOtMultiplier: number; // e.g. 2
  otBase: "BASIC" | "GROSS";
  otHoursPerMonth: number; // e.g. 208
  dailyRateDivisor: number; // e.g. 30
  lateDaysPerDeduction: number; // 0 = off
};

export type PayrollInputs = {
  monthlyGross: number;
  basicPercent: number;
  overtimeMinutes: number; // approved, credited OT on normal days
  holidayOvertimeMinutes: number; // approved, credited OT on public holidays
  unpaidLeaveDays: number;
  absentDays: number; // confirmed absences (shift marked absent by a lead)
  lateCount: number; // late check-ins incl. missed check-ins
  adjustment: number; // manual +/- (bonus, advance, correction)
};

export type PayrollBreakdown = {
  gross: number;
  basic: number;
  hourlyRate: number;
  dailyRate: number;
  overtimeHours: number;
  holidayOvertimeHours: number;
  otPay: number;
  unpaidLeaveDays: number;
  unpaidDeduction: number;
  absentDays: number;
  absentDeduction: number;
  lateCount: number;
  lateDeductionDays: number;
  lateDeduction: number;
  deductions: number;
  adjustment: number;
  net: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function calculatePayroll(rules: PayrollRules, i: PayrollInputs): PayrollBreakdown {
  const gross = Math.max(0, Math.round(i.monthlyGross));
  const basic = Math.round((gross * Math.min(100, Math.max(0, i.basicPercent))) / 100);
  const hourlyRate = (rules.otBase === "GROSS" ? gross : basic) / Math.max(1, rules.otHoursPerMonth);
  const dailyRate = gross / Math.max(1, rules.dailyRateDivisor);

  const overtimeHours = round2(i.overtimeMinutes / 60);
  const holidayOvertimeHours = round2(i.holidayOvertimeMinutes / 60);
  const otPay = Math.round(hourlyRate * (overtimeHours * rules.otMultiplier + holidayOvertimeHours * rules.holidayOtMultiplier));

  const unpaidDeduction = Math.round(i.unpaidLeaveDays * dailyRate);
  const absentDeduction = Math.round(i.absentDays * dailyRate);
  const lateDeductionDays = rules.lateDaysPerDeduction > 0 ? Math.floor(i.lateCount / rules.lateDaysPerDeduction) : 0;
  const lateDeduction = Math.round(lateDeductionDays * dailyRate);
  const deductions = unpaidDeduction + absentDeduction + lateDeduction;
  const adjustment = Math.round(i.adjustment);

  return {
    gross,
    basic,
    hourlyRate: round2(hourlyRate),
    dailyRate: round2(dailyRate),
    overtimeHours,
    holidayOvertimeHours,
    otPay,
    unpaidLeaveDays: i.unpaidLeaveDays,
    unpaidDeduction,
    absentDays: i.absentDays,
    absentDeduction,
    lateCount: i.lateCount,
    lateDeductionDays,
    lateDeduction,
    deductions,
    adjustment,
    // Never negative — a month with heavy deductions pays 0, not a debt.
    net: Math.max(0, gross + otPay + adjustment - deductions),
  };
}
