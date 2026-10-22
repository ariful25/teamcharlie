import { prisma } from "@/lib/prisma";

// Ownership checks for ids that arrive from the browser. Every write that
// takes a userId / shiftTypeId / record id must confirm it belongs to the
// caller's team first — see CLAUDE.md "Every query must be scoped by teamId".

export async function teamOwnsUser(teamId: string, userId: string) {
  return !!(await prisma.user.findFirst({ where: { id: userId, teamId }, select: { id: true } }));
}

/** null/undefined counts as owned — "no shift type" is always allowed. */
export async function teamOwnsShiftType(teamId: string, shiftTypeId: string | null | undefined) {
  if (!shiftTypeId) return true;
  return !!(await prisma.shiftType.findFirst({ where: { id: shiftTypeId, teamId }, select: { id: true } }));
}
