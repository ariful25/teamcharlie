// Tests for lib/payroll/calc.ts — run with `npm run test:payroll`.

import assert from "node:assert/strict";
import { calculatePayroll, type PayrollRules } from "../lib/payroll/calc";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const rules: PayrollRules = { otMultiplier: 1.5, holidayOtMultiplier: 2, otBase: "BASIC", otHoursPerMonth: 208, dailyRateDivisor: 30, lateDaysPerDeduction: 0 };
const base = { monthlyGross: 30000, basicPercent: 60, overtimeMinutes: 0, holidayOvertimeMinutes: 0, unpaidLeaveDays: 0, absentDays: 0, lateCount: 0, adjustment: 0 };

console.log("Payroll");

test("a clean month pays the gross", () => {
  const p = calculatePayroll(rules, base);
  assert.equal(p.basic, 18000);
  assert.equal(p.net, 30000);
});

test("overtime: basic ÷ 208 × 1.5 per hour (team default)", () => {
  // 18000 / 208 = 86.54/h; 4h × 1.5 = 519.23 → 519
  const p = calculatePayroll(rules, { ...base, overtimeMinutes: 240 });
  assert.equal(p.otPay, 519);
  assert.equal(p.net, 30519);
});

test("public-holiday overtime uses the 2× rate", () => {
  const p = calculatePayroll(rules, { ...base, holidayOvertimeMinutes: 120 });
  assert.equal(p.otPay, Math.round((18000 / 208) * 2 * 2));
});

test("overtime can be based on gross instead of basic", () => {
  const p = calculatePayroll({ ...rules, otBase: "GROSS" }, { ...base, overtimeMinutes: 60 });
  assert.equal(p.otPay, Math.round((30000 / 208) * 1.5));
});

test("unpaid leave and confirmed absences deduct gross ÷ 30 per day", () => {
  const p = calculatePayroll(rules, { ...base, unpaidLeaveDays: 2, absentDays: 1 });
  assert.equal(p.unpaidDeduction, 2000);
  assert.equal(p.absentDeduction, 1000);
  assert.equal(p.net, 27000);
});

test("late rule is off by default; when on, every N lates cost a day", () => {
  assert.equal(calculatePayroll(rules, { ...base, lateCount: 7 }).lateDeduction, 0);
  const p = calculatePayroll({ ...rules, lateDaysPerDeduction: 3 }, { ...base, lateCount: 7 });
  assert.equal(p.lateDeductionDays, 2);
  assert.equal(p.lateDeduction, 2000);
});

test("manual adjustments add or subtract", () => {
  assert.equal(calculatePayroll(rules, { ...base, adjustment: 5000 }).net, 35000);
  assert.equal(calculatePayroll(rules, { ...base, adjustment: -2500 }).net, 27500);
});

test("net pay never goes negative", () => {
  assert.equal(calculatePayroll(rules, { ...base, unpaidLeaveDays: 31, adjustment: -1000 }).net, 0);
});

console.log(`\n${passed} passed`);
