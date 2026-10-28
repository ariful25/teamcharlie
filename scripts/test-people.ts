// Tests for lib/people/access.ts — run with `npm run test:people`.

import assert from "node:assert/strict";
import { createsManagerLoop, daysUntilBirthday, editableFields, profileAccess, tenure } from "../lib/people/access";
import { changeError, inviteMessage, parsePeopleList, placementError, rolesActorCanGive } from "../lib/people/adding";

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

test("HR has the admin's profile access", () => {
  const hr = profileAccess({ id: "hr", role: "HR" }, "u1");
  assert.equal(hr.editJob, true);
  assert.equal(hr.viewPay, true);
  assert.equal(hr.viewPrivateEvents, true);
});

const admin = { role: "ADMIN" as const, squadId: null };
const hr = { role: "HR" as const, squadId: null };
const lead = { role: "TEAM_LEAD" as const, squadId: "charlie" };
const emp = { role: "EMPLOYEE" as const, squadId: "charlie" };

test("adding people: leads add employees to their own team only", () => {
  assert.equal(placementError(lead, { role: "EMPLOYEE", squadId: "charlie" }), null);
  assert.match(placementError(lead, { role: "EMPLOYEE", squadId: "bravo" })!, /own team/);
  assert.match(placementError(lead, { role: "TEAM_LEAD", squadId: "charlie" })!, /employees/);
  assert.match(placementError(emp, { role: "EMPLOYEE", squadId: "charlie" })!, /Only admins/);
  assert.deepEqual(rolesActorCanGive(lead), ["EMPLOYEE"]);
  assert.deepEqual(rolesActorCanGive(emp), []);
});

test("adding people: HR adds anyone but an admin; admin adds anyone", () => {
  assert.equal(placementError(hr, { role: "TEAM_LEAD", squadId: "bravo" }), null);
  assert.equal(placementError(hr, { role: "HR", squadId: null }), null);
  assert.match(placementError(hr, { role: "ADMIN", squadId: null })!, /Only an admin/);
  assert.equal(placementError(admin, { role: "ADMIN", squadId: null }), null);
});

test("adding people: employees and leads need a team; admin and HR never get one", () => {
  assert.match(placementError(admin, { role: "EMPLOYEE", squadId: null })!, /Pick a team/);
  assert.match(placementError(admin, { role: "HR", squadId: "charlie" })!, /across all teams/);
});

test("changing people: never by leads; HR can't touch an admin", () => {
  assert.match(changeError(lead, { role: "EMPLOYEE", squadId: "charlie" }, { role: "EMPLOYEE", squadId: "charlie" })!, /Only admins and HR/);
  assert.match(changeError(hr, { role: "ADMIN", squadId: null }, { role: "EMPLOYEE", squadId: "charlie" })!, /Only an admin can change an admin/);
  assert.equal(changeError(hr, { role: "EMPLOYEE", squadId: "charlie" }, { role: "TEAM_LEAD", squadId: "bravo" }), null);
  assert.match(changeError(hr, { role: "EMPLOYEE", squadId: "charlie" }, { role: "ADMIN", squadId: null })!, /Only an admin/);
});

test("a pasted list: name and email in either order, bad lines explained", () => {
  const r = parsePeopleList("Rafi Ahmed, rafi@x.com\nnadia@x.com; Nadia Islam\n\nno email here\nRAFI@x.com, Rafi again\n\tjust@x.com");
  assert.deepEqual(r.people, [
    { name: "Rafi Ahmed", email: "rafi@x.com" },
    { name: "Nadia Islam", email: "nadia@x.com" },
  ]);
  assert.deepEqual(r.problems.map((p) => p.reason), ["No email address", "Listed twice", "No name"]);
});

test("the WhatsApp invite text uses the first name and has no dashes", () => {
  const m = inviteMessage("Rafi Ahmed", "STR Assistance", "https://x/invite/abc");
  assert.match(m, /^Hi Rafi, /);
  assert.match(m, /https:\/\/x\/invite\/abc/);
  assert.doesNotMatch(m, /[–—]/);
});

console.log(`\n${passed} passed`);
