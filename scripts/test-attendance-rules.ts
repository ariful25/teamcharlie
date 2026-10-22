// Scenario tests for lib/attendance/rules.ts — run with `npm run test:attendance`.
// Mirrors docs/attendance-rules.md and the real-world cases the team raised.

import assert from "node:assert/strict";
import {
  autoStopAt,
  canReview,
  creditFor,
  exceedsDailyLimit,
  resolveShiftForCheckIn,
  shiftWindow,
  type RecordTimes,
} from "../lib/attendance/rules";

const TZ = "Asia/Dhaka";
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const at = (iso: string) => new Date(iso); // ISO with offset
const base: RecordTimes = {
  actualCheckIn: null,
  actualCheckOut: null,
  effectiveCheckIn: null,
  effectiveCheckOut: null,
  claimedCheckIn: null,
  autoClosedAt: null,
  shiftStartAt: null,
  shiftEndAt: null,
  review: "NONE",
};
const h = (m: number) => m / 60;

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("Attendance rules");

test("overnight shift is one window ending the next day", () => {
  const w = shiftWindow(day("2026-09-16"), "23:00", "07:00", TZ);
  assert.equal(w.startAt.toISOString(), "2026-09-16T17:00:00.000Z");
  assert.equal(w.endAt.toISOString(), "2026-09-17T01:00:00.000Z");
});

test("check-in at 23:55 for a 00:00 shift lands on the next day's shift", () => {
  const today = { date: day("2026-10-20"), ...shiftWindow(day("2026-10-20"), "00:00", "08:00", TZ) };
  const tomorrow = { date: day("2026-10-21"), ...shiftWindow(day("2026-10-21"), "00:00", "08:00", TZ) };
  const picked = resolveShiftForCheckIn([today, tomorrow], at("2026-10-20T23:55:00+06:00"));
  assert.equal(picked?.date.toISOString(), day("2026-10-21").toISOString());
});

test("no shift nearby → unscheduled", () => {
  const s = { date: day("2026-10-20"), ...shiftWindow(day("2026-10-20"), "09:00", "18:00", TZ) };
  assert.equal(resolveShiftForCheckIn([s], at("2026-10-20T02:00:00+06:00")), null);
});

test("user's example: 8 PM check-in, forgot checkout → stops after 10h", () => {
  const w = shiftWindow(day("2026-10-20"), "20:00", "05:00", TZ); // 9h shift
  const stop = autoStopAt({ checkIn: at("2026-10-20T20:00:00+06:00"), shiftEndAt: w.endAt, approvedOvertimeMinutes: 0, capHours: 10 });
  assert.equal(stop.toISOString(), at("2026-10-21T06:00:00+06:00").toISOString());
});

test("forgot checkout counts scheduled time only (9h), pending review — not 10h", () => {
  const w = shiftWindow(day("2026-10-20"), "20:00", "05:00", TZ);
  const c = creditFor(
    { ...base, actualCheckIn: at("2026-10-20T20:00:00+06:00"), autoClosedAt: at("2026-10-21T06:00:00+06:00"), shiftStartAt: w.startAt, shiftEndAt: w.endAt, review: "PENDING" },
    0
  );
  assert.equal(c.bucket, "pending");
  assert.equal(h(c.regularMinutes), 9);
  assert.equal(c.overtimeMinutes, 0);
});

test("a 12h scheduled shift is never auto-stopped at 10h (conflict #1)", () => {
  const w = shiftWindow(day("2026-10-20"), "09:00", "21:00", TZ);
  const stop = autoStopAt({ checkIn: w.startAt, shiftEndAt: w.endAt, approvedOvertimeMinutes: 0, capHours: 10 });
  assert.equal(stop.toISOString(), w.endAt.toISOString());
});

test("approved overtime extends the auto-stop", () => {
  const w = shiftWindow(day("2026-10-20"), "09:00", "18:00", TZ);
  const stop = autoStopAt({ checkIn: w.startAt, shiftEndAt: w.endAt, approvedOvertimeMinutes: 120, capHours: 10 });
  assert.equal(stop.toISOString(), new Date(w.endAt.getTime() + 2 * 3600000).toISOString());
});

test("late check-in + forgot checkout: provisional starts at the real check-in (conflict #2)", () => {
  const w = shiftWindow(day("2026-10-20"), "09:00", "18:00", TZ);
  const c = creditFor(
    { ...base, actualCheckIn: at("2026-10-20T11:00:00+06:00"), autoClosedAt: at("2026-10-20T21:00:00+06:00"), shiftStartAt: w.startAt, shiftEndAt: w.endAt, review: "PENDING" },
    0
  );
  assert.equal(h(c.regularMinutes), 7);
});

test("checkout 3h late with no approved overtime → 0 overtime, 3h unapproved extra (conflict #4)", () => {
  const w = shiftWindow(day("2026-10-20"), "09:00", "18:00", TZ);
  const c = creditFor({ ...base, actualCheckIn: w.startAt, actualCheckOut: at("2026-10-20T21:00:00+06:00"), shiftStartAt: w.startAt, shiftEndAt: w.endAt }, 0);
  assert.equal(c.bucket, "credited");
  assert.equal(h(c.regularMinutes), 9);
  assert.equal(c.overtimeMinutes, 0);
  assert.equal(h(c.extraMinutes), 3);
});

test("approved 2h overtime, worked 3h late → 2h overtime + 1h extra", () => {
  const w = shiftWindow(day("2026-10-20"), "09:00", "18:00", TZ);
  const c = creditFor({ ...base, actualCheckIn: w.startAt, actualCheckOut: at("2026-10-20T21:00:00+06:00"), shiftStartAt: w.startAt, shiftEndAt: w.endAt }, 120);
  assert.equal(h(c.overtimeMinutes), 2);
  assert.equal(h(c.extraMinutes), 1);
});

test("approved overtime but left on time → no overtime credited", () => {
  const w = shiftWindow(day("2026-10-20"), "09:00", "18:00", TZ);
  const c = creditFor({ ...base, actualCheckIn: w.startAt, actualCheckOut: w.endAt, shiftStartAt: w.startAt, shiftEndAt: w.endAt }, 120);
  assert.equal(c.overtimeMinutes, 0);
});

test("admin edit doesn't create overtime: approved times past the shift end are extra (conflict #3)", () => {
  const w = shiftWindow(day("2026-10-20"), "09:00", "18:00", TZ);
  const c = creditFor(
    { ...base, actualCheckIn: w.startAt, effectiveCheckIn: w.startAt, effectiveCheckOut: at("2026-10-20T20:00:00+06:00"), shiftStartAt: w.startAt, shiftEndAt: w.endAt, review: "APPROVED" },
    0
  );
  assert.equal(c.overtimeMinutes, 0);
  assert.equal(h(c.extraMinutes), 2);
});

test("approved record uses the approved times, not the raw punches", () => {
  const w = shiftWindow(day("2026-10-20"), "09:00", "18:00", TZ);
  const c = creditFor(
    { ...base, actualCheckIn: at("2026-10-20T10:00:00+06:00"), effectiveCheckIn: w.startAt, effectiveCheckOut: w.endAt, shiftStartAt: w.startAt, shiftEndAt: w.endAt, review: "APPROVED" },
    0
  );
  assert.equal(h(c.regularMinutes), 9);
});

test("rejected auto-stopped session with no real check-out counts nothing", () => {
  const c = creditFor({ ...base, actualCheckIn: at("2026-10-20T09:00:00+06:00"), autoClosedAt: at("2026-10-20T19:00:00+06:00"), review: "REJECTED" }, 0);
  assert.equal(c.bucket, "none");
});

test("open session is not credited until it ends", () => {
  assert.equal(creditFor({ ...base, actualCheckIn: at("2026-10-20T09:00:00+06:00") }, 0).bucket, "open");
});

test("early arrival before the shift start isn't paid as regular time", () => {
  const w = shiftWindow(day("2026-10-20"), "09:00", "18:00", TZ);
  const c = creditFor({ ...base, actualCheckIn: at("2026-10-20T08:00:00+06:00"), actualCheckOut: w.endAt, shiftStartAt: w.startAt, shiftEndAt: w.endAt }, 0);
  assert.equal(h(c.regularMinutes), 9);
  assert.equal(h(c.extraMinutes), 1);
});

test("remote timezone: on-time New York check-in isn't late for a Dhaka viewer", () => {
  const w = shiftWindow(day("2026-10-20"), "09:00", "17:00", "America/New_York");
  assert.equal(w.startAt.toISOString(), "2026-10-20T13:00:00.000Z");
});

test("10h daily limit warning", () => {
  const w = shiftWindow(day("2026-10-20"), "09:00", "18:00", TZ);
  assert.equal(exceedsDailyLimit(w.startAt, w.endAt, 60), false);
  assert.equal(exceedsDailyLimit(w.startAt, w.endAt, 90), true);
});

test("leads can't approve themselves; admins can", () => {
  assert.equal(canReview({ id: "a", role: "TEAM_LEAD" }, "a"), false);
  assert.equal(canReview({ id: "a", role: "TEAM_LEAD" }, "b"), true);
  assert.equal(canReview({ id: "a", role: "ADMIN" }, "a"), true);
  assert.equal(canReview({ id: "a", role: "EMPLOYEE" }, "b"), false);
});

console.log(`\n${passed} passed`);
