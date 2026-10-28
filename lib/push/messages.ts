// What each phone notification says and who gets it. Pure, so it's tested
// in scripts/test-push.ts. Lock screens are visible to anyone holding the
// phone, so a notice's text is never put in a notification (notices can
// hold door or Wi-Fi details): only who posted it.

export type PushMessage = { title: string; body: string; url: string; tag: string };

type Role = "ADMIN" | "HR" | "TEAM_LEAD" | "EMPLOYEE";

const clip = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

const DAY_FMT = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
/** Leave dates are calendar days stored at UTC midnight. */
export function dayRange(start: Date, end: Date) {
  const a = DAY_FMT.format(start).replace(",", "");
  const b = DAY_FMT.format(end).replace(",", "");
  return a === b ? a : `${a} to ${b}`;
}

const LEAVE_NAME = { PAID: "paid leave", UNPAID: "unpaid leave", SICK: "sick leave" } as const;
type LeaveKind = keyof typeof LEAVE_NAME;

/**
 * A task notifies its assignee when someone else gives it to them: on
 * creation, or when an edit changes who it's assigned to. Assigning a task
 * to yourself, or editing one without changing the assignee, sends nothing.
 */
export function taskAssignedRecipient(input: { actorId: string; before: string | null | undefined; after: string | null | undefined }) {
  const { actorId, before, after } = input;
  if (!after || after === actorId || after === before) return null;
  return after;
}

export function taskAssignedMessage(task: { id: string; title: string; dueTime?: string | null; client?: { name: string } | null }, actorName: string): PushMessage {
  const details = [task.client?.name, task.dueTime ? `due ${task.dueTime}` : null].filter(Boolean).join(" · ");
  return {
    title: `${actorName} gave you a task`,
    body: clip(details ? `${task.title}\n${details}` : task.title),
    url: "/tasks",
    tag: `task:${task.id}`,
  };
}

type Member = { id: string; role: Role; active: boolean; squadId: string | null };

/** A team notice reaches that team (plus Admin and HR); a company-wide one (squadId null) reaches everyone. */
export function noticeRecipients(members: Member[], authorId: string, squadId: string | null = null) {
  return members
    .filter((m) => m.active && m.id !== authorId && (!squadId || m.squadId === squadId || m.role === "ADMIN" || m.role === "HR"))
    .map((m) => m.id);
}

export function noticeMessage(notice: { id: string }, authorName: string): PushMessage {
  return { title: "New notice", body: `${authorName} posted on the notice board`, url: "/notices", tag: `notice:${notice.id}` };
}

/** Leave requests go to everyone who can decide them: Admin, HR and the
 *  requester's own team lead. Never the requester, never another team's lead. */
export function leaveReviewers(members: Member[], requester: { id: string; squadId: string | null }) {
  return members
    .filter(
      (m) =>
        m.active &&
        m.id !== requester.id &&
        (m.role === "ADMIN" || m.role === "HR" || (m.role === "TEAM_LEAD" && !!m.squadId && m.squadId === requester.squadId))
    )
    .map((m) => m.id);
}

export function leaveRequestedMessage(req: { id: string; type: LeaveKind; startDate: Date; endDate: Date }, requesterName: string): PushMessage {
  return {
    title: "Leave request",
    body: `${requesterName} asked for ${LEAVE_NAME[req.type]}: ${dayRange(req.startDate, req.endDate)}`,
    url: "/attendance/admin",
    tag: `leave:${req.id}`,
  };
}

export function leaveDecidedMessage(
  req: { id: string; type: LeaveKind; startDate: Date; endDate: Date; reviewNote?: string | null },
  action: "APPROVE" | "REJECT" | "REVOKE",
  reviewerName: string
): PushMessage {
  const title = { APPROVE: "Leave approved", REJECT: "Leave not approved", REVOKE: "Leave revoked" }[action];
  const what = `${dayRange(req.startDate, req.endDate)} · ${LEAVE_NAME[req.type]} · ${reviewerName}`;
  return {
    title,
    body: clip(req.reviewNote ? `${what}\n“${req.reviewNote}”` : what),
    url: "/attendance",
    tag: `leave:${req.id}`,
  };
}
