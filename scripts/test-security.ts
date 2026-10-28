// Security suite — run against a RUNNING server with its database:
//   BASE_URL=http://localhost:3123 DATABASE_URL=… npm run test:security
// Creates two throwaway teams (victim + attacker), signs in for real through
// NextAuth, attacks, asserts, and deletes everything it created. Never point
// it at production.

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3123";
if (/vercel\.app|teamhq|charlie/i.test(BASE) && !BASE.includes("localhost")) throw new Error("Refusing to run the security suite against a non-local URL.");
const prisma = new PrismaClient();
const run = randomBytes(4).toString("hex");
const pw = () => `T3st-${randomBytes(9).toString("base64url")}`;

let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

/* ------------------------------------------------------------- http client */

class Client {
  private cookies = new Map<string, string>();
  private store(res: Response) {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
  }
  private header() {
    return Array.from(this.cookies, ([k, v]) => `${k}=${v}`).join("; ");
  }
  async req(method: string, path: string, body?: unknown, raw?: string) {
    const res = await fetch(BASE + path, {
      method,
      redirect: "manual",
      headers: { cookie: this.header(), "content-type": "application/json", "x-forwarded-for": `10.9.${run.length}.1` },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    this.store(res);
    return { status: res.status, text: await res.text() };
  }
  /** Signs in; returns the NextAuth error code, or null on success. */
  async signIn(email: string, password: string, ip = "10.1.1.1"): Promise<string | null> {
    const csrfRes = await fetch(BASE + "/api/auth/csrf", { headers: { cookie: this.header() } });
    this.store(csrfRes);
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
    const res = await fetch(BASE + "/api/auth/callback/credentials", {
      method: "POST",
      redirect: "manual",
      headers: { cookie: this.header(), "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip },
      body: new URLSearchParams({ csrfToken, email, password, json: "true" }).toString(),
    });
    this.store(res);
    const location = res.headers.get("location") ?? (await res.text());
    const error = location.match(/error=([A-Z_]+)/)?.[1];
    return error ?? null;
  }
}

/* ---------------------------------------------------------------- fixtures */

async function makeTeam(label: string) {
  const team = await prisma.team.create({ data: { name: `${label} ${run}`, slug: `${label.toLowerCase()}-${run}` } });
  const users: Record<string, { id: string; email: string; password: string }> = {};
  for (const role of ["ADMIN", "TEAM_LEAD", "EMPLOYEE"] as const) {
    const password = pw();
    const email = `${role.toLowerCase()}-${label.toLowerCase()}-${run}@example.test`;
    const u = await prisma.user.create({ data: { name: `${label} ${role}`, email, passwordHash: await bcrypt.hash(password, 4), role, teamId: team.id } });
    users[role] = { id: u.id, email, password };
  }
  const client = await prisma.client.create({ data: { name: `${label} client ${run}`, teamId: team.id } });
  const property = await prisma.propertyKnowledgeItem.create({ data: { clientId: client.id, internalName: `${label} home`, airbnbUrl: "https://www.airbnb.com/rooms/1" } as never });
  const task = await prisma.task.create({ data: { teamId: team.id, clientId: client.id, title: `${label} task`, date: new Date() } });
  const shift = await prisma.shiftType.create({ data: { teamId: team.id, name: `Evening ${run}`, startTime: "17:00", endTime: "01:00" } });
  const stay = await prisma.guestStay.create({ data: { teamId: team.id, propertyId: property.id, guestName: "Guest", checkOut: new Date() } });
  const review = await prisma.listingReview.create({ data: { propertyId: property.id, source: "MANUAL", rating: 4, comment: "ok", fingerprint: run + label, createdById: users.ADMIN.id } });
  return { team, users, client, property, task, shift, stay, review };
}

async function cleanup(teamIds: string[]) {
  const where = { teamId: { in: teamIds } };
  const props = await prisma.propertyKnowledgeItem.findMany({ where: { client: where }, select: { id: true } });
  const pids = props.map((p) => p.id);
  const users = await prisma.user.findMany({ where, select: { id: true, email: true } });
  await prisma.listingReview.deleteMany({ where: { propertyId: { in: pids } } });
  await prisma.guestStay.deleteMany({ where });
  await prisma.employeeEvent.deleteMany({ where });
  await prisma.employeeProfile.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  await prisma.task.deleteMany({ where });
  await prisma.notice.deleteMany({ where });
  await prisma.leaveRequest.deleteMany({ where });
  await prisma.teamInvite.deleteMany({ where });
  await prisma.propertyKnowledgeItem.deleteMany({ where: { id: { in: pids } } });
  await prisma.client.deleteMany({ where });
  await prisma.shiftType.deleteMany({ where });
  await prisma.teamSettings.deleteMany({ where });
  await prisma.user.deleteMany({ where });
  await prisma.squad.deleteMany({ where });
  await prisma.team.deleteMany({ where: { id: { in: teamIds } } });
  await prisma.rateLimit.deleteMany({ where: { key: { contains: run } } });
  await prisma.rateLimit.deleteMany({ where: { key: { in: users.map((u) => `login:account:${u.email}`) } } });
}

/** Two teams inside one company: the victim's existing lead, employee and
 *  client become Team Charlie, and Team Alfa gets its own lead, employee,
 *  client, listing, task, notice, stay, review and leave request. Plus HR. */
async function makeSquads(company: Awaited<ReturnType<typeof makeTeam>>) {
  const teamId = company.team.id;
  const charlie = await prisma.squad.create({ data: { teamId, name: `Charlie ${run}` } });
  const alfa = await prisma.squad.create({ data: { teamId, name: `Alfa ${run}` } });
  await prisma.user.updateMany({ where: { id: { in: [company.users.TEAM_LEAD.id, company.users.EMPLOYEE.id] } }, data: { squadId: charlie.id } });
  await prisma.client.update({ where: { id: company.client.id }, data: { squadId: charlie.id } });
  await prisma.task.update({ where: { id: company.task.id }, data: { squadId: charlie.id } });
  const person = async (role: "TEAM_LEAD" | "EMPLOYEE" | "HR", squadId: string | null) => {
    const password = pw();
    const email = `${role.toLowerCase()}-alfa-${run}@example.test`;
    const u = await prisma.user.create({ data: { name: `Alfa ${role}`, email, passwordHash: await bcrypt.hash(password, 4), role, teamId, squadId } });
    return { id: u.id, email, password };
  };
  const lead = await person("TEAM_LEAD", alfa.id);
  const employee = await person("EMPLOYEE", alfa.id);
  const hr = await person("HR", null);
  const client = await prisma.client.create({ data: { name: `Alfa client ${run}`, teamId, squadId: alfa.id } });
  const property = await prisma.propertyKnowledgeItem.create({ data: { clientId: client.id, internalName: "Alfa home", airbnbUrl: "https://www.airbnb.com/rooms/2" } as never });
  const task = await prisma.task.create({ data: { teamId, squadId: alfa.id, clientId: client.id, title: `Alfa secret task ${run}`, date: new Date() } });
  const notice = await prisma.notice.create({ data: { teamId, squadId: alfa.id, authorId: lead.id, content: `Alfa secret notice ${run}` } });
  const stay = await prisma.guestStay.create({ data: { teamId, propertyId: property.id, guestName: "Alfa guest", checkOut: new Date() } });
  const review = await prisma.listingReview.create({ data: { propertyId: property.id, source: "MANUAL", rating: 5, comment: "great", fingerprint: run + "alfa", createdById: lead.id } });
  const day = new Date(Date.UTC(2027, 0, 4));
  const leave = await prisma.leaveRequest.create({ data: { teamId, userId: employee.id, type: "PAID", startDate: day, endDate: day, days: 1, reason: "trip" } });
  return { charlie, alfa, lead, employee, hr, client, property, task, notice, stay, review, leave };
}

/* ------------------------------------------------------------------- tests */

async function main() {
  const victim = await makeTeam("Victim");
  const attacker = await makeTeam("Attacker");
  try {
    const mallory = new Client();
    assert.equal(await mallory.signIn(attacker.users.ADMIN.email, attacker.users.ADMIN.password), null, "attacker admin can sign in");

    await test("another team's admin can't read or change anything of ours", async () => {
      const v = victim;
      const attempts: [string, string, unknown?][] = [
        ["PATCH", `/api/clients/${v.client.id}`, { name: "pwned" }],
        ["GET", `/api/clients/${v.client.id}`],
        ["PATCH", `/api/tasks/${v.task.id}`, { status: "COMPLETED" }],
        ["DELETE", `/api/tasks/${v.task.id}`],
        ["PATCH", `/api/users/${v.users.EMPLOYEE.id}`, { role: "ADMIN" }],
        ["PATCH", `/api/shift-types/${v.shift.id}`, { name: "pwned" }],
        ["PATCH", `/api/people/${v.users.EMPLOYEE.id}`, { jobTitle: "pwned" }],
        ["POST", `/api/people/${v.users.EMPLOYEE.id}/items`, { type: "event", kind: "PRAISE", title: "pwned" }],
        ["POST", `/api/listing-health/${v.property.id}/refresh`, {}],
        ["PATCH", `/api/reviews/stays/${v.stay.id}`, { action: "CLOSE" }],
        ["PATCH", `/api/reviews/${v.review.id}`, { rating: 1 }],
        ["POST", `/api/reviews/stays`, { guestName: "x", propertyId: v.property.id, checkOut: "2026-10-20" }],
        ["POST", `/api/listing-health/reviews/paste`, { action: "read", clientId: v.client.id, text: "Sam\nOctober 2026\nGreat stay" }],
      ];
      for (const [m, p, b] of attempts) {
        const r = await mallory.req(m, p, b);
        assert.ok(r.status >= 400, `${m} ${p} must be refused, got ${r.status}: ${r.text.slice(0, 120)}`);
      }
      const after = await prisma.client.findUniqueOrThrow({ where: { id: v.client.id } });
      assert.notEqual(after.name, "pwned");
      assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: v.users.EMPLOYEE.id } })).role, "EMPLOYEE");
    });

    const emp = new Client();
    assert.equal(await emp.signIn(victim.users.EMPLOYEE.email, victim.users.EMPLOYEE.password, "10.2.2.2"), null, "employee can sign in");

    await test("an employee can't do admin things", async () => {
      const me = victim.users.EMPLOYEE.id;
      const attempts: [string, string, unknown?][] = [
        ["PATCH", `/api/users/${me}`, { role: "ADMIN" }],
        ["PATCH", `/api/users/${victim.users.TEAM_LEAD.id}`, { active: false }],
        ["GET", `/api/payroll?month=2026-10`],
        ["POST", `/api/settings/review-inbox`],
        ["PATCH", `/api/settings/ai`, { enabled: true }],
        ["PATCH", `/api/settings/team`, { name: "pwned" }],
        ["PATCH", `/api/people/${me}`, { jobTitle: "CEO" }],
        ["POST", `/api/people/${me}/items`, { type: "event", kind: "PRAISE", title: "self" }],
        ["PUT", `/api/reviews/templates`, { key: "FOLLOW_UP", body: "x" }],
        ["POST", `/api/invites`, { email: `x-${run}@example.test`, role: "ADMIN" }],
      ];
      for (const [m, p, b] of attempts) {
        const r = await emp.req(m, p, b);
        assert.ok(r.status === 401 || r.status === 403, `${m} ${p} must be forbidden, got ${r.status}`);
      }
    });

    const sq = await makeSquads(victim);
    const charlieLead = new Client();
    assert.equal(await charlieLead.signIn(victim.users.TEAM_LEAD.email, victim.users.TEAM_LEAD.password, "10.5.5.5"), null);

    await test("a team lead never reaches another team inside the same company", async () => {
      const a = sq;
      const attempts: [string, string, unknown?][] = [
        ["PATCH", `/api/tasks/${a.task.id}`, { status: "COMPLETED" }],
        ["DELETE", `/api/tasks/${a.task.id}`],
        ["PATCH", `/api/notices/${a.notice.id}`, { pinned: true }],
        ["PATCH", `/api/leave/${a.leave.id}`, { action: "APPROVE" }],
        ["POST", `/api/listing-health/${a.property.id}/refresh`, {}],
        ["PATCH", `/api/reviews/stays/${a.stay.id}`, { action: "CLOSE" }],
        ["PATCH", `/api/reviews/${a.review.id}`, { rating: 1 }],
        ["POST", `/api/listing-health/reviews`, { propertyId: a.property.id, rating: 1, comment: "fake" }],
        ["POST", `/api/tasks`, { title: "into alfa", clientId: a.client.id, date: "2026-10-27" }],
        ["POST", `/api/shift-schedule`, { userId: a.employee.id, shiftTypeId: victim.shift.id, weekStart: "2026-10-26" }],
        ["POST", `/api/people/add`, { people: [{ name: "Spy", email: `spy-${run}@example.test` }], role: "EMPLOYEE", squadId: a.alfa.id, method: "invite" }],
        ["POST", `/api/people/add`, { people: [{ name: "Boss", email: `boss-${run}@example.test` }], role: "TEAM_LEAD", squadId: a.charlie.id, method: "invite" }],
        ["PATCH", `/api/users/${victim.users.EMPLOYEE.id}`, { squadId: a.alfa.id }],
      ];
      for (const [m, p, b] of attempts) {
        const r = await charlieLead.req(m, p, b);
        assert.ok(r.status >= 400, `${m} ${p} must be refused, got ${r.status}: ${r.text.slice(0, 120)}`);
      }
      assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: a.task.id } })).status, "UPCOMING");
      assert.equal((await prisma.leaveRequest.findUniqueOrThrow({ where: { id: a.leave.id } })).status, "PENDING");
      assert.equal(await prisma.teamInvite.count({ where: { email: { in: [`spy-${run}@example.test`, `boss-${run}@example.test`] } } }), 0);
      for (const path of ["/api/tasks", "/api/notices", "/dashboard", "/tasks", "/notices", "/people", "/reviews", "/knowledge-base"]) {
        const r = await charlieLead.req("GET", path);
        assert.ok(!r.text.includes("Alfa secret") && !r.text.includes(`Alfa client ${run}`), `${path} shows another team's data`);
      }
      // The page streams (loading.tsx), so "not found" arrives inside a 200.
      // What matters is that none of the person's details do.
      const profile = await charlieLead.req("GET", `/people/${a.employee.id}`);
      assert.ok(!profile.text.includes(a.employee.email) && !profile.text.includes("Alfa EMPLOYEE"), "another team's profile is shown");
      assert.match(profile.text, /NEXT_HTTP_ERROR_FALLBACK;404|could not be found/i);
    });

    await test("a team lead adds employees to their own team", async () => {
      const r = await charlieLead.req("POST", `/api/people/add`, { people: [{ name: "New Hire", email: `hire-${run}@example.test` }], role: "EMPLOYEE", squadId: sq.charlie.id, method: "invite" });
      assert.equal(r.status, 200, r.text);
      const link: string = JSON.parse(r.text).results[0].link;
      assert.ok(link.startsWith(BASE), `invite link uses the address in use, got ${link}`);
      const invite = await prisma.teamInvite.findFirstOrThrow({ where: { email: `hire-${run}@example.test` } });
      assert.deepEqual([invite.squadId, invite.role, invite.name], [sq.charlie.id, "EMPLOYEE", "New Hire"]);
    });

    const hr = new Client();
    assert.equal(await hr.signIn(sq.hr.email, sq.hr.password, "10.6.6.6"), null);

    await test("HR sees every team but can't create or change an admin", async () => {
      const tasks = (await hr.req("GET", "/api/tasks")).text;
      assert.ok(tasks.includes("Alfa secret task") && tasks.includes("Victim task"), "HR sees all teams");
      assert.equal((await hr.req("PATCH", `/api/users/${victim.users.EMPLOYEE.id}`, { role: "ADMIN" })).status, 403);
      assert.equal((await hr.req("PATCH", `/api/users/${victim.users.ADMIN.id}`, { active: false })).status, 403);
      assert.equal((await hr.req("POST", `/api/people/add`, { people: [{ name: "X", email: `x2-${run}@example.test` }], role: "ADMIN", squadId: null, method: "invite" })).status, 403);
      assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: victim.users.EMPLOYEE.id } })).role, "EMPLOYEE");
    });

    await test("moving someone to another team takes effect on their next request", async () => {
      const charlieEmp = new Client();
      assert.equal(await charlieEmp.signIn(victim.users.EMPLOYEE.email, victim.users.EMPLOYEE.password, "10.7.7.7"), null);
      assert.ok(!(await charlieEmp.req("GET", "/api/tasks")).text.includes("Alfa secret task"));
      await prisma.user.update({ where: { id: victim.users.EMPLOYEE.id }, data: { squadId: sq.alfa.id } });
      assert.ok((await charlieEmp.req("GET", "/api/tasks")).text.includes("Alfa secret task"), "same session, new team");
      await prisma.user.update({ where: { id: victim.users.EMPLOYEE.id }, data: { active: false } });
      assert.equal((await charlieEmp.req("GET", "/api/tasks")).status, 401, "deactivated mid-session loses access at once");
      await prisma.user.update({ where: { id: victim.users.EMPLOYEE.id }, data: { active: true, squadId: sq.charlie.id } });
    });

    await test("password hashes never reach a browser", async () => {
      for (const path of ["/api/users", "/tasks", "/tasks/history", "/dashboard", "/people", "/attendance", "/reviews"]) {
        const r = await emp.req("GET", path);
        assert.ok(!/passwordHash|\$2[aby]\$\d\d\$/.test(r.text), `${path} leaks a password hash`);
      }
    });

    const admin = new Client();
    assert.equal(await admin.signIn(victim.users.ADMIN.email, victim.users.ADMIN.password, "10.3.3.3"), null);

    await test("a team always keeps an active admin", async () => {
      const r = await admin.req("PATCH", `/api/users/${victim.users.ADMIN.id}`, { role: "EMPLOYEE" });
      assert.equal(r.status, 400);
      assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: victim.users.ADMIN.id } })).role, "ADMIN");
    });

    await test("broken input is a 400, never a 500", async () => {
      for (const path of ["/api/tasks", "/api/clients", "/api/notices", "/api/leave", "/api/reviews/stays"]) {
        for (const raw of ["{not json", "[1,2,3]", "{}"]) {
          const r = await admin.req("POST", path, undefined, raw);
          assert.ok(r.status >= 400 && r.status < 500, `${path} with ${raw} → ${r.status}`);
        }
      }
    });

    await test("sign-in locks after 10 wrong passwords, even with the right one", async () => {
      const target = victim.users.TEAM_LEAD;
      const c = new Client();
      for (let i = 0; i < 10; i++) assert.equal(await c.signIn(target.email, "wrong-password", `10.4.${i}.1`), "INVALID_CREDENTIALS");
      assert.equal(await c.signIn(target.email, target.password, "10.4.99.1"), "TOO_MANY_ATTEMPTS");
      await prisma.rateLimit.deleteMany({ where: { key: `login:account:${target.email}` } });
      assert.equal(await c.signIn(target.email, target.password, "10.4.99.2"), null, "works again once the window is cleared");
    });

    await test("Airbnb email sync rejects missing or wrong keys", async () => {
      const anon = new Client();
      assert.equal((await anon.req("POST", "/api/inbound/reviews", { messages: [] })).status, 401);
      const r = await fetch(BASE + "/api/inbound/reviews", { method: "POST", headers: { authorization: "Bearer thq_rev_wrong", "content-type": "application/json" }, body: "{}" });
      assert.equal(r.status, 401);
    });

    await test("signed-out visitors get nothing", async () => {
      const anon = new Client();
      for (const path of ["/api/users", "/api/tasks", "/api/payroll?month=2026-10"]) {
        const r = await anon.req("GET", path);
        assert.ok(r.status === 401 || r.status === 403 || r.status === 307, `${path} → ${r.status}`);
      }
      const page = await anon.req("GET", "/dashboard");
      assert.ok([302, 303, 307].includes(page.status), "dashboard redirects to sign-in");
    });
  } finally {
    await cleanup([victim.team.id, attacker.team.id]);
    await prisma.$disconnect();
  }
  console.log(`\n${passed} passed`);
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
