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
  await prisma.propertyKnowledgeItem.deleteMany({ where: { id: { in: pids } } });
  await prisma.client.deleteMany({ where });
  await prisma.shiftType.deleteMany({ where });
  await prisma.teamSettings.deleteMany({ where });
  await prisma.user.deleteMany({ where });
  await prisma.team.deleteMany({ where: { id: { in: teamIds } } });
  await prisma.rateLimit.deleteMany({ where: { key: { contains: run } } });
  await prisma.rateLimit.deleteMany({ where: { key: { in: users.map((u) => `login:account:${u.email}`) } } });
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
