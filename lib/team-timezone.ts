import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { DEFAULT_TIMEZONE } from "@/lib/time";

/** The team's own timezone (Team.timezone). Memoized per request in Server
 *  Components; a plain lookup in route handlers. */
export const getTeamTimezone = cache(async (teamId: string): Promise<string> => {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { timezone: true } });
  return team?.timezone || DEFAULT_TIMEZONE;
});
