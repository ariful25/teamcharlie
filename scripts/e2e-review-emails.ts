// End-to-end: real Airbnb email layouts through ingestAirbnbEmails on a
// throwaway team in a LOCAL database. Run:
//   DATABASE_URL=postgresql://…localhost…/db npx tsx scripts/e2e-review-emails.ts
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { applyStayAction, ingestAirbnbEmails } from "../lib/reviews/service";
import * as F from "./fixtures/airbnb-emails";

if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")) throw new Error("Refusing: DATABASE_URL must be a local database.");

const run = Date.now().toString(36);
let n = 0;
const msg = (e: { subject: string; from: string; body: string; date: string }) => ({ id: `${run}-${n++}`, ...e });
const d = (s: string) => new Date(`${s}T00:00:00Z`);
let passed = 0;
const ok = (name: string) => (passed++, console.log(`  ✓ ${name}`));

async function main() {
  const team = await prisma.team.create({ data: { name: `E2E ${run}`, slug: `e2e-${run}` } });
  try {
    const admin = await prisma.user.create({ data: { name: "E2E admin", email: `e2e-${run}@example.test`, passwordHash: "x", role: "ADMIN", teamId: team.id } });
    await prisma.teamSettings.create({ data: { teamId: team.id, reviewInboxCreatedById: admin.id } as never });
    const client = await prisma.client.create({ data: { name: `E2E client ${run}`, teamId: team.id } });
    const listing = (internalName: string, listingName: string, airbnbListingId: string | null = null) =>
      prisma.propertyKnowledgeItem.create({ data: { clientId: client.id, internalName, listingName, airbnbListingId, airbnbUrl: `https://www.airbnb.com/rooms/${airbnbListingId ?? internalName.toLowerCase()}` } as never });
    const chalet = await listing("Chalet", "Mountain View Chalet Near the Peaks");
    const uptown = await listing("Uptown", "Modern Uptown Retreat | Hot Tub & Game Room");
    const serene = await listing("Serene", "Serene Ridge Retreat", "1400000000000000002");
    const lux = await listing("Lux", "Luxury 8BR Home", "1500000000000000001");
    const stay = (data: Record<string, unknown>) => prisma.guestStay.create({ data: { teamId: team.id, ...data } as never });

    const rosa = await stay({ guestName: "Rosa Diaz", propertyId: chalet.id, confirmationCode: "HMEF56GH78", checkIn: d("2026-10-23"), checkOut: d("2026-10-26"), stage: "BOOKED" });
    const priya = await stay({ guestName: "Priya Shah", propertyId: uptown.id, checkIn: d("2026-10-23"), checkOut: d("2026-10-25"), stage: "FOLLOW_UP_SENT" });
    const karim = await stay({ guestName: "Karim", propertyId: serene.id, checkIn: d("2026-09-21"), checkOut: d("2026-09-22"), stage: "REVIEW_REQUESTED" });
    const lena = await stay({ guestName: "Lena Park", propertyId: lux.id, checkOut: d("2026-10-25"), stage: "BOOKED" });
    const theo = await stay({ guestName: "Theo", propertyId: serene.id, confirmationCode: "HMCD34EF56", checkOut: d("2026-10-29"), stage: "BOOKED" });

    const result = await ingestAirbnbEmails(team.id, [msg(F.CHANGE_REQUEST), msg(F.UPDATED), msg(F.WROTE_YOU), msg(F.ONE_STAR), msg(F.CHECKOUT), msg(F.CANCELLED), msg(F.CONFIRMED)]);
    const get = (id: string) => prisma.guestStay.findUniqueOrThrow({ where: { id }, include: { events: true } });
    const openTasks = async (id: string) =>
      (await prisma.task.findMany({ where: { teamId: team.id, sourceRef: { startsWith: `stay:${id}:` }, status: { not: "COMPLETED" } } })).map((t) => t.sourceRef!.split(":")[2]);

    const r = await get(rosa.id);
    assert.equal(r.checkOut?.toISOString().slice(0, 10), "2026-10-28");
    assert.equal(r.stage, "BOOKED");
    assert.ok(r.events.some((e) => e.kind === "CHANGE_REQUESTED"));
    ok("extension: request + 'Reservation updated' move checkout to the 28th; still booked");

    let p = await get(priya.id);
    assert.deepEqual([p.stage, p.rating], ["REVIEWED", null]);
    assert.deepEqual(await openTasks(priya.id), ["review-guest"]);
    ok("'wrote you a review': stay reviewed (hidden), task to review the guest");

    await applyStayAction(team.id, admin.id, priya.id, { action: "HOST_REVIEWED" });
    assert.deepEqual(await openTasks(priya.id), []);
    const later = {
      ...F.FOUR_STAR,
      subject: "Priya left a 4-star review",
      date: "2026-10-27T10:00:00Z",
      body: F.FOUR_STAR.body
        .replace("Uptown Retreat Sleeps 10 w/Hot Tub, BBQ Game Room", "Modern Uptown Retreat | Hot Tub & Game Room")
        .replace("Oct 3 – 5, 2026", "Oct 23 – 25, 2026")
        .replace(/\[https:\/\/www\.airbnb\.com\/co-hosts[^\]]*\]/, ""),
    };
    await ingestAirbnbEmails(team.id, [msg(later)]);
    p = await get(priya.id);
    assert.equal(p.rating, 4);
    assert.ok(p.reviewId);
    assert.deepEqual(await openTasks(priya.id), ["respond"]);
    ok("we review them → task closes; the 4★ email later fills the rating and asks for a response");

    const k = await get(karim.id);
    assert.deepEqual([k.stage, k.rating], ["REVIEWED", 1]);
    assert.deepEqual(await openTasks(karim.id), ["respond"]);
    ok("nameless 1★ matched by listing + checkout day; urgent response task");

    const l = await get(lena.id);
    assert.equal(l.stage, "CHECKED_OUT");
    assert.equal(await prisma.guestStay.count({ where: { teamId: team.id, guestName: { startsWith: "Lena" } } }), 1);
    ok("'Lena’s group' matched Lena Park; no duplicate stay");

    assert.equal((await get(theo.id)).stage, "CANCELLED");
    ok("cancellation by code");

    const dana = await prisma.guestStay.findFirstOrThrow({ where: { teamId: team.id, confirmationCode: "HMAB12CD34" } });
    assert.deepEqual([dana.propertyId, dana.checkIn?.toISOString().slice(0, 10), dana.checkOut?.toISOString().slice(0, 10), dana.guests], [lux.id, "2027-01-15", "2027-01-17", 16]);
    ok("new booking: listing, both dates and guest count");

    assert.equal(result.needsReview, 0);
    ok("nothing left for a person to sort out");
  } finally {
    const where = { teamId: team.id };
    await prisma.task.deleteMany({ where });
    await prisma.reviewInboxItem.deleteMany({ where });
    await prisma.listingReview.deleteMany({ where: { property: { client: where } } });
    await prisma.guestStay.deleteMany({ where });
    await prisma.propertyKnowledgeItem.deleteMany({ where: { client: where } });
    await prisma.client.deleteMany({ where });
    await prisma.teamSettings.deleteMany({ where });
    await prisma.user.deleteMany({ where });
    await prisma.team.delete({ where: { id: team.id } });
  }
  console.log(`\n${passed} passed`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
