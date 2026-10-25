// Tests for lib/reviews — run with `npm run test:reviews`.

import assert from "node:assert/strict";
import { classifyEmail, dateNear, readAirbnbEmail } from "../lib/reviews/airbnb-email";
import { daysLeft, sameGuest, stageAfter, taskFor, timedStage } from "../lib/reviews/pipeline";
import { DEFAULT_TEMPLATES, fillTemplate, policyWarnings } from "../lib/reviews/templates";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const AIRBNB = "Airbnb <automated@airbnb.com>";

test("emails are classified; guest messages are never treated as reservations", () => {
  assert.equal(classifyEmail("Reservation confirmed - Sarah Jones arrives Oct 30", AIRBNB), "CONFIRMED");
  assert.equal(classifyEmail("Reservation HMABCD1234 canceled", AIRBNB), "CANCELLED");
  assert.equal(classifyEmail("Your reservation was altered", AIRBNB), "ALTERED");
  assert.equal(classifyEmail("Write a review for Sarah", AIRBNB), "CHECKOUT");
  assert.equal(classifyEmail("Sarah left a 5-star review!", AIRBNB), "GUEST_REVIEW");
  assert.equal(classifyEmail("RE: Reservation at Jaeger Haus for Oct 30 – Nov 2", AIRBNB), "OTHER");
  assert.equal(classifyEmail("New message from Sarah", AIRBNB), "OTHER");
  assert.equal(classifyEmail("Reservation confirmed", "someone@gmail.com"), "OTHER");
});

test("a confirmation email gives code, guest, dates, guests and listing", () => {
  const r = readAirbnbEmail({
    subject: "Reservation confirmed - Sarah Jones arrives Oct 30",
    from: AIRBNB,
    date: d("2026-10-20"),
    body: `New booking confirmed! Sarah arrives Oct 30.\nCheck-in\nThu, Oct 30\n4:00 PM\nCheckout\nSun, Nov 2\n11:00 AM\nGuests\n3 adults\nConfirmation code\nHMABCD1234\nhttps://www.airbnb.com/rooms/1000645092029118307`,
  });
  assert.equal(r.kind, "CONFIRMED");
  assert.equal(r.confirmationCode, "HMABCD1234");
  assert.equal(r.guestName, "Sarah Jones");
  assert.equal(r.checkIn, "2026-10-30");
  assert.equal(r.checkOut, "2026-11-02");
  assert.equal(r.guests, 3);
  assert.equal(r.listingRef, "1000645092029118307");
});

test("regressions from replaying real-shaped emails", () => {
  const altered = readAirbnbEmail({ subject: "Reservation confirmed - Tom Baker arrives Nov 2", from: AIRBNB, date: d("2026-10-12"), body: "Check-in\nMon, Nov 2\nCheckout\nThu, Nov 5\nGuests\n4 guests\nConfirmation code HMBBBB2222" });
  assert.equal(altered.guests, 4, "the checkout day must not be read as the guest count");
  const cancelled = readAirbnbEmail({ subject: "Reservation HMCCCC3333 canceled", from: AIRBNB, date: d("2026-10-16"), body: "Ana canceled her reservation HMCCCC3333." });
  assert.equal(cancelled.guestName, "Ana", "the subject's 'Reservation HM…' is not a guest name");
  assert.equal(cancelled.confirmationCode, "HMCCCC3333");
});

test("dates without a year roll into next year near New Year", () => {
  assert.equal(dateNear("Checkout\nSat, Jan 3", /check-?\s?out/, d("2026-12-20")), "2027-01-03");
  assert.equal(dateNear("Check-in: 30 Oct 2026", /check-?\s?in/, d("2026-10-01")), "2026-10-30");
});

test("checkout reached → follow up; window closed → expired", () => {
  const stay = { stage: "BOOKED", checkOut: d("2026-10-24") };
  assert.equal(timedStage(stay, d("2026-10-23")), null);
  assert.equal(timedStage(stay, d("2026-10-24")), "CHECKED_OUT");
  assert.equal(timedStage({ stage: "REVIEW_REQUESTED", checkOut: d("2026-10-01") }, d("2026-10-15")), "EXPIRED");
  assert.equal(timedStage({ stage: "BOOKED", checkOut: d("2026-09-01") }, d("2026-10-15")), "EXPIRED", "learned about too late");
  assert.equal(timedStage({ stage: "REVIEWED", checkOut: d("2026-09-01") }, d("2026-10-15")), null);
  assert.equal(daysLeft(d("2026-10-24"), d("2026-10-25")), 13);
});

test("actions move stays only from sensible stages", () => {
  assert.equal(stageAfter("CHECKED_OUT", "FOLLOW_UP_SENT"), "FOLLOW_UP_SENT");
  assert.equal(stageAfter("FOLLOW_UP_SENT", "HAPPY"), "ASK_REVIEW");
  assert.equal(stageAfter("ASK_REVIEW", "REVIEW_REQUESTED"), "REVIEW_REQUESTED");
  assert.equal(stageAfter("ISSUE", "REVIEW_REQUESTED"), null, "no review request while an issue is open");
  assert.equal(stageAfter("FOLLOW_UP_SENT", "ISSUE"), "ISSUE");
  assert.equal(stageAfter("ISSUE", "ISSUE_RESOLVED"), "ASK_REVIEW");
  assert.equal(stageAfter("BOOKED", "HAPPY"), null, "can't ask before checkout");
  assert.equal(stageAfter("REVIEWED", "CLOSE"), null);
});

test("tasks: follow up at checkout, fix issues, respond to anything under 5★", () => {
  assert.equal(taskFor("CHECKED_OUT", null)?.key, "follow-up");
  assert.equal(taskFor("ISSUE", null)?.priority, "URGENT");
  assert.equal(taskFor("ASK_REVIEW", null)?.key, "ask");
  assert.equal(taskFor("REVIEWED", 5), null);
  assert.equal(taskFor("REVIEWED", 4)?.key, "respond");
  assert.equal(taskFor("REVIEWED", 2)?.priority, "URGENT");
  assert.equal(taskFor("REVIEW_REQUESTED", null), null);
});

test("guest names match across full and first-name emails", () => {
  assert.equal(sameGuest("Sarah Jones", "Sarah"), true);
  assert.equal(sameGuest("Sarah", "Mike"), false);
});

test("templates fill in, and the defaults pass the review-policy check", () => {
  assert.match(fillTemplate(DEFAULT_TEMPLATES.FOLLOW_UP, { firstName: "Sarah", listing: "Jaeger Haus" }), /^Hi Sarah! Thank you for staying with us. We hope/);
  for (const body of Object.values(DEFAULT_TEMPLATES)) assert.deepEqual(policyWarnings(body), []);
  assert.equal(policyWarnings("I'll be leaving you a 5-star review! If you enjoyed it, please leave us a 5-star rating as well.").length, 1);
  assert.equal(policyWarnings("Leave 5 stars and get a 10% discount next time").length, 1);
});

console.log(`\n${passed} passed`);
