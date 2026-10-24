// Tests for lib/people/access.ts — run with `npm run test:people`.

import assert from "node:assert/strict";
import { createsManagerLoop, daysUntilBirthday, editableFields, profileAccess, tenure } from "../lib/people/access";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
const d = (s: string) => new Date(`${s}T00:00:00Z`);

test("teammates see job and about only", () => {
  const a = profileAccess({ id: "u2", role: "EMPLOYEE" }, "u1");
  assert.equal(a.viewPersonal, false);
  assert.equal(a.viewEmergency, false);
  assert.equal(a.viewDocuments, false);
  assert.equal(a.viewPay, false);
  assert.equal(a.viewTime, false);
  assert.deepEqual(editableFields(a), []);
});

test("people edit their own contact and personal details, never job fields", () => {
  const a = profileAccess({ id: "u1", role: "EMPLOYEE" }, "u1");
  const fields = editableFields(a);
  assert.ok(fields.includes("phone") && fields.includes("dateOfBirth") && fields.includes("bio"));
  assert.ok(!fields.includes("jobTitle") && !fields.includes("managerId") && !fields.includes("startDate"));
  assert.equal(a.viewPay, true);
  assert.equal(a.addPraise, false, "no praising yourself");
});

test("team leads see emergency contacts and time, not personal data or pay", () => {
  const a = profileAccess({ id: "lead", role: "TEAM_LEAD" }, "u1");
  assert.equal(a.viewEmergency, true);
  assert.equal(a.viewTime, true);
  assert.equal(a.viewPersonal, false);
  assert.equal(a.viewPay, false);
  assert.equal(a.addPraise, true);
  assert.equal(a.addNoteOrWarning, false);
});

test("admins edit everything but can't write notes about themselves", () => {
  const other = profileAccess({ id: "admin", role: "ADMIN" }, "u1");
  assert.ok(editableFields(other).includes("managerId"));
  assert.equal(other.viewPrivateEvents, true);
  assert.equal(other.addNoteOrWarning, true);
  assert.equal(profileAccess({ id: "admin", role: "ADMIN" }, "admin").addNoteOrWarning, false);
});

test("manager loops are refused", () => {
  const managerOf = new Map<string, string | null>([
    ["a", null],
    ["b", "a"],
    ["c", "b"],
  ]);
  assert.equal(createsManagerLoop("a", "c", managerOf), true, "a → c → b → a");
  assert.equal(createsManagerLoop("a", "a", managerOf), true, "self");
  assert.equal(createsManagerLoop("c", "a", managerOf), false);
  assert.equal(createsManagerLoop("b", null, managerOf), false);
});

test("tenure reads in years and months", () => {
  assert.equal(tenure(d("2024-07-15"), d("2026-10-24")), "2 yrs 3 mos");
  assert.equal(tenure(d("2026-10-01"), d("2026-10-24")), "23 days");
  assert.equal(tenure(d("2025-10-24"), d("2026-10-24")), "1 yr");
  assert.equal(tenure(d("2026-11-01"), d("2026-10-24")), null);
});

test("birthday countdown wraps into next year", () => {
  assert.equal(daysUntilBirthday(d("1998-10-24"), d("2026-10-24")), 0);
  assert.equal(daysUntilBirthday(d("1998-10-30"), d("2026-10-24")), 6);
  assert.equal(daysUntilBirthday(d("1998-01-02"), d("2026-12-31")), 2);
});

console.log(`\n${passed} passed`);
