// Tests for lib/tasks/visibility.ts — run with `npm run test:tasks`.

import assert from "node:assert/strict";
import { boardPhase, COMPLETED_GRACE_MS, dueAt, releaseAt } from "../lib/tasks/visibility";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
const TZ = "Asia/Dhaka"; // UTC+6, no DST
const day = new Date("2026-10-24T00:00:00Z");

test("a shift's recurring task is released when the shift starts", () => {
  const evening = releaseAt({ recurringTemplateId: "tpl", date: day, shiftType: { startTime: "17:00" } }, TZ);
  assert.equal(evening?.toISOString(), "2026-10-24T11:00:00.000Z"); // 17:00 Dhaka
  const night = releaseAt({ recurringTemplateId: "tpl", date: day, shiftType: { startTime: "00:00" } }, TZ);
  assert.equal(night?.toISOString(), "2026-10-23T18:00:00.000Z"); // midnight Dhaka = day start
});

test("one-off tasks and recurring tasks without a shift are there from the start of the day", () => {
  assert.equal(releaseAt({ recurringTemplateId: null, date: day, shiftType: { startTime: "17:00" } }, TZ), null);
  assert.equal(releaseAt({ recurringTemplateId: "tpl", date: day, shiftType: null }, TZ), null);
});

test("unreleased tasks wait in 'later', then join the board", () => {
  const releaseAtIso = "2026-10-24T11:00:00.000Z";
  assert.equal(boardPhase({ status: "UPCOMING", releaseAt: releaseAtIso }, Date.parse("2026-10-24T10:59:00Z")), "later");
  assert.equal(boardPhase({ status: "UPCOMING", releaseAt: releaseAtIso }, Date.parse("2026-10-24T11:00:00Z")), "board");
  assert.equal(boardPhase({ status: "OVERDUE", releaseAt: null }, 0), "board");
});

test("completed tasks stay for 5 minutes, then leave the board", () => {
  const done = Date.parse("2026-10-24T12:00:00Z");
  assert.equal(boardPhase({ status: "COMPLETED", completedAt: new Date(done) }, done + 60_000), "board");
  assert.equal(boardPhase({ status: "COMPLETED", completedAt: new Date(done) }, done + COMPLETED_GRACE_MS - 1), "board");
  assert.equal(boardPhase({ status: "COMPLETED", completedAt: new Date(done) }, done + COMPLETED_GRACE_MS), "done");
  assert.equal(boardPhase({ status: "COMPLETED", completedAt: null }, done), "done", "no timestamp = completed long ago");
});

test("a completed task is done even if its shift hasn't started yet", () => {
  const done = Date.parse("2026-10-24T05:00:00Z");
  assert.equal(boardPhase({ status: "COMPLETED", completedAt: new Date(done), releaseAt: "2026-10-24T11:00:00Z" }, done + COMPLETED_GRACE_MS), "done");
});

test("due times follow the shift: an overnight shift's 00:30 is the next morning", () => {
  const evening = { startTime: "17:00" };
  assert.equal(dueAt({ date: day, dueTime: "22:00", shiftType: evening }, TZ)?.toISOString(), "2026-10-24T16:00:00.000Z", "22:00 same evening");
  assert.equal(dueAt({ date: day, dueTime: "00:30", shiftType: evening }, TZ)?.toISOString(), "2026-10-24T18:30:00.000Z", "00:30 next morning");
  assert.equal(dueAt({ date: day, dueTime: "00:30", shiftType: null }, TZ)?.toISOString(), "2026-10-23T18:30:00.000Z", "no shift: its own day");
  assert.equal(dueAt({ date: day, dueTime: null, shiftType: evening }, TZ), null);
});

console.log(`\n${passed} passed`);
