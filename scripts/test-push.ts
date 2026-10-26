// Tests for lib/push/messages.ts — run with `npm run test:push`.
import assert from "node:assert/strict";
import * as M from "../lib/push/messages";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const d = (s: string) => new Date(`${s}T00:00:00Z`);

test("a task notifies its assignee only when someone else gives it to them", () => {
  const r = M.taskAssignedRecipient;
  assert.equal(r({ actorId: "lead", before: null, after: "john" }), "john");
  assert.equal(r({ actorId: "lead", before: "sarah", after: "john" }), "john");
  assert.equal(r({ actorId: "john", before: null, after: "john" }), null, "assigning yourself");
  assert.equal(r({ actorId: "lead", before: "john", after: "john" }), null, "edit that keeps the assignee");
  assert.equal(r({ actorId: "lead", before: "john", after: null }), null, "unassigned");
  assert.equal(r({ actorId: "lead", before: "john", after: undefined }), null);
});

test("task message: title, client and due time; no empty separators", () => {
  const m = M.taskAssignedMessage({ id: "t1", title: "Restock linens", dueTime: "14:00", client: { name: "Perfect Stay" } }, "Ayesha");
  assert.deepEqual(m, { title: "Ayesha gave you a task", body: "Restock linens\nPerfect Stay · due 14:00", url: "/tasks", tag: "task:t1" });
  assert.equal(M.taskAssignedMessage({ id: "t2", title: "Call the plumber" }, "Ayesha").body, "Call the plumber");
  assert.ok(M.taskAssignedMessage({ id: "t3", title: "x".repeat(300) }, "A").body.length <= 120);
});

test("notices go to every active teammate except the author, and never carry the text", () => {
  const team = [
    { id: "a", active: true },
    { id: "b", active: true },
    { id: "c", active: false },
  ];
  assert.deepEqual(M.noticeRecipients(team, "a"), ["b"]);
  const m = M.noticeMessage({ id: "n1" }, "Ayesha");
  assert.equal(m.body, "Ayesha posted on the notice board");
  assert.equal(m.url, "/notices");
});

test("leave requests go to active admins and leads, never the requester", () => {
  const team = [
    { id: "admin", role: "ADMIN" as const, active: true },
    { id: "lead", role: "TEAM_LEAD" as const, active: true },
    { id: "oldlead", role: "TEAM_LEAD" as const, active: false },
    { id: "john", role: "EMPLOYEE" as const, active: true },
  ];
  assert.deepEqual(M.leaveReviewers(team, "john"), ["admin", "lead"]);
  assert.deepEqual(M.leaveReviewers(team, "lead"), ["admin"], "a lead asking for leave");
  const m = M.leaveRequestedMessage({ id: "l1", type: "PAID", startDate: d("2026-10-26"), endDate: d("2026-10-27") }, "John Doe");
  assert.equal(m.body, "John Doe asked for paid leave: Mon 26 Oct to Tue 27 Oct");
  assert.equal(m.url, "/attendance/admin");
});

test("leave decisions: what happened, which days, who decided, and their note", () => {
  const req = { id: "l1", type: "SICK" as const, startDate: d("2026-11-03"), endDate: d("2026-11-03") };
  assert.deepEqual(M.leaveDecidedMessage(req, "APPROVE", "Farhan"), {
    title: "Leave approved",
    body: "Tue 3 Nov · sick leave · Farhan",
    url: "/attendance",
    tag: "leave:l1",
  });
  assert.equal(M.leaveDecidedMessage({ ...req, reviewNote: "Short-staffed" }, "REJECT", "Farhan").body, "Tue 3 Nov · sick leave · Farhan\n“Short-staffed”");
  assert.equal(M.leaveDecidedMessage(req, "REVOKE", "Farhan").title, "Leave revoked");
});

test("dates are calendar days, not shifted by timezone", () => {
  assert.equal(M.dayRange(d("2026-12-31"), d("2027-01-01")), "Thu 31 Dec to Fri 1 Jan");
});

test("copy style: no em or en dashes anywhere", () => {
  const all = [
    M.taskAssignedMessage({ id: "t", title: "T", dueTime: "1", client: { name: "C" } }, "A"),
    M.noticeMessage({ id: "n" }, "A"),
    M.leaveRequestedMessage({ id: "l", type: "UNPAID", startDate: d("2026-01-01"), endDate: d("2026-01-02") }, "A"),
    ...(["APPROVE", "REJECT", "REVOKE"] as const).map((a) => M.leaveDecidedMessage({ id: "l", type: "PAID", startDate: d("2026-01-01"), endDate: d("2026-01-01") }, a, "B")),
  ];
  for (const m of all) assert.doesNotMatch(`${m.title} ${m.body}`, /[–—]/);
});

// The real public/sw.js, run against a fake service-worker global.
async function serviceWorker(windows: { url: string; navigate?: (u: string) => Promise<unknown> }[] = []) {
  const handlers: Record<string, (e: unknown) => void> = {};
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const opened: string[] = [];
  const self = {
    location: { origin: "https://teamcharlie.vercel.app" },
    addEventListener: (type: string, fn: (e: unknown) => void) => (handlers[type] = fn),
    registration: { showNotification: async (title: string, options: Record<string, unknown>) => void shown.push({ title, options }) },
    clients: {
      matchAll: async () => windows.map((w) => ({ ...w, focus: async () => null, navigate: w.navigate ?? (async () => null) })),
      openWindow: async (u: string) => void opened.push(u),
    },
  };
  const { readFileSync } = await import("node:fs");
  new Function("self", "caches", "fetch", readFileSync("public/sw.js", "utf8"))(self, {}, () => {});
  const fire = async (type: string, event: Record<string, unknown>) => {
    let wait: Promise<unknown> = Promise.resolve();
    handlers[type]({ ...event, waitUntil: (p: Promise<unknown>) => (wait = p) });
    await wait;
  };
  return { fire, shown, opened };
}

async function main() {
  {
    const sw = await serviceWorker();
    const msg = M.taskAssignedMessage({ id: "t1", title: "Restock linens", dueTime: "18:00", client: { name: "Andrea" } }, "Farhan");
    await sw.fire("push", { data: { json: () => msg, text: () => JSON.stringify(msg) } });
    assert.equal(sw.shown.length, 1);
    assert.equal(sw.shown[0].title, "Farhan gave you a task");
    assert.deepEqual(sw.shown[0].options, { body: "Restock linens\nAndrea · due 18:00", tag: "task:t1", icon: "/app-icon/192", data: { url: "/tasks" } });

    await sw.fire("push", { data: { json: () => JSON.parse("{"), text: () => "plain text" } });
    assert.deepEqual([sw.shown[1].title, sw.shown[1].options.body], ["TeamHQ", "plain text"]);
    passed++;
    console.log("  ✓ service worker: a push shows the message; a malformed one still shows something");
  }
  {
    const closed: string[] = [];
    const tapped = (url: string) => ({ notification: { data: { url }, close: () => void closed.push(url) } });
    const none = await serviceWorker();
    await none.fire("notificationclick", tapped("/tasks"));
    assert.deepEqual(none.opened, ["https://teamcharlie.vercel.app/tasks"]);

    const went: string[] = [];
    const open = await serviceWorker([{ url: "https://teamcharlie.vercel.app/dashboard", navigate: async (u) => void went.push(u) }]);
    await open.fire("notificationclick", tapped("/notices"));
    assert.deepEqual([went, open.opened], [["https://teamcharlie.vercel.app/notices"], []]);

    const uncontrolled = await serviceWorker([{ url: "https://teamcharlie.vercel.app/x", navigate: async () => Promise.reject(new TypeError("not controlled")) }]);
    await uncontrolled.fire("notificationclick", tapped("/attendance"));
    assert.deepEqual(uncontrolled.opened, ["https://teamcharlie.vercel.app/attendance"]);
    assert.equal(closed.length, 3);
    passed++;
    console.log("  ✓ service worker: tapping opens the page, reusing an open window, or a new one if it can't");
  }
  console.log(`\n${passed} passed`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
