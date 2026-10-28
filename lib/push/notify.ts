// Server-side ONLY. One call per event, like lib/notifications.ts: works out
// who should get a phone notification (lib/push/messages.ts) and sends it.
import { prisma } from "@/lib/prisma";
import { pushToUsers } from "./send";
import * as M from "./messages";

type Actor = { id: string; name: string };

export async function pushTaskAssigned(
  teamId: string,
  task: Parameters<typeof M.taskAssignedMessage>[0] & { assignedUserId: string | null },
  actor: Actor,
  assigneeBefore: string | null
) {
  const to = M.taskAssignedRecipient({ actorId: actor.id, before: assigneeBefore, after: task.assignedUserId });
  if (to) await pushToUsers(teamId, [to], M.taskAssignedMessage(task, actor.name));
}

async function members(teamId: string) {
  return prisma.user.findMany({ where: { teamId }, select: { id: true, role: true, active: true, squadId: true } });
}

export async function pushNoticePosted(teamId: string, notice: { id: string; squadId: string | null }, author: Actor) {
  await pushToUsers(teamId, M.noticeRecipients(await members(teamId), author.id, notice.squadId), M.noticeMessage(notice, author.name));
}

type Leave = Parameters<typeof M.leaveDecidedMessage>[0] & { userId: string };

export async function pushLeaveRequested(teamId: string, request: Leave, requester: Actor) {
  const team = await members(teamId);
  const squadId = team.find((m) => m.id === requester.id)?.squadId ?? null;
  await pushToUsers(teamId, M.leaveReviewers(team, { id: requester.id, squadId }), M.leaveRequestedMessage(request, requester.name));
}

export async function pushLeaveDecided(teamId: string, request: Leave, action: "APPROVE" | "REJECT" | "REVOKE", reviewer: Actor) {
  if (request.userId === reviewer.id) return;
  await pushToUsers(teamId, [request.userId], M.leaveDecidedMessage(request, action, reviewer.name));
}
