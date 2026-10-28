// Tests for lib/portal/rules.ts — run with `npm run test:portal`.
import assert from "node:assert/strict";
import { hideCodes, healthWord, portalDate, portalInviteMessage, requestIdFromSourceRef, requestSourceRef, requestTask, stars } from "../lib/portal/rules";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

test("an owner request becomes a clear task for the team", () => {
  const t = requestTask("KNOWLEDGE_BASE", "Midwest", "Lake House", "Wi-Fi password changed");
  assert.equal(t.title, "Midwest asked to update property details: Lake House");
  assert.equal(t.description, "Wi-Fi password changed");
  assert.equal(t.priority, "NORMAL");
  assert.equal(requestTask("REVIEW", "Midwest", null, "x").priority, "IMPORTANT", "a review worry is never left at normal");
  assert.equal(requestTask("OTHER", "Midwest", null, "x").title, "Midwest asked to help");
  assert.ok(requestTask("LISTING", "M".repeat(200), "L", "x").title.length <= 140);
});

test("the task's source ref leads back to the request, and nothing else matches", () => {
  assert.equal(requestIdFromSourceRef(requestSourceRef("cm123abc")), "cm123abc");
  assert.equal(requestIdFromSourceRef("stay:abc:ask"), null);
  assert.equal(requestIdFromSourceRef("creq:abc:extra"), null);
  assert.equal(requestIdFromSourceRef(null), null);
});

test("health scores read in words, on the same bands as the staff colours", () => {
  assert.deepEqual([95, 85, 70, 40, null].map(healthWord), ["Excellent", "Good", "Needs attention", "At risk", "Not checked yet"]);
});

test("ratings and dates read cleanly; empty is a dot", () => {
  assert.deepEqual([4.86, 4.9, 5, 4, null].map(stars), ["4.86", "4.9", "5", "4.0", "·"]);
  assert.equal(portalDate(new Date("2026-10-26T00:00:00Z")), "26 Oct 2026");
  assert.equal(portalDate(null), "·");
});

test("portal invite message: first name, the link, no dashes", () => {
  const m = portalInviteMessage("Dana Kirby", "Midwest", "https://x/portal/invite/t");
  assert.match(m, /^Hi Dana, here is your owner portal for Midwest/);
  assert.match(m, /https:\/\/x\/portal\/invite\/t/);
  assert.doesNotMatch(m, /[–—]/);
});

test("codes typed into free text are hidden from owners", () => {
  const cases: [string, string][] = [
    ["Lockbox on the side door, code 4821. Park in the driveway.", "Lockbox on the side door, code [hidden]. Park in the driveway."],
    ["Door code is 7731#", "Door code is [hidden]"],
    ["Wi-Fi password: sunshine22", "Wi-Fi password: [hidden]"],
    ["Gate code A12B then turn left", "Gate code [hidden] then turn left"],
    ["Keypad 48 21 at the back", "Keypad [hidden] at the back"],
    ["Call 555-0199 if locked out", "Call [hidden] if locked out"],
    ["Check-in after 3 pm, 2 parking spots, max 6 guests", "Check-in after 3 pm, 2 parking spots, max 6 guests"],
    ["The lockbox is on the porch", "The lockbox is on the porch"],
  ];
  for (const [input, want] of cases) assert.equal(hideCodes(input), want, input);
  assert.equal(hideCodes(null), null);
});

console.log(`\n${passed} passed`);
