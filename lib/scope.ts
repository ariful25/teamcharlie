import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { isCompanyWide, type AppRole } from "@/lib/auth";
import type { CurrentUser } from "@/lib/session";

// Two walls, both enforced on the server:
// 1. The company (teamId). Every query, always. Nothing crosses it.
// 2. The team inside the company (squadId). Leads and employees only ever
//    see their own team. Admin and HR see every team, or one team at a time
//    when they pick it in the team switcher (the `squad` cookie).
//
// Pages and routes build their `where` from these helpers instead of from
// user.teamId alone, so a missing team filter is one place to fix, not 100.

export const SQUAD_COOKIE = "squad";
// Matches no row: a lead or employee who hasn't been put in a team yet sees
// nothing team-specific rather than everything.
const NO_SQUAD = "__none__";

export type Scope = {
  teamId: string;
  /** The team being looked at. Null means every team (Admin and HR only). */
  squadId: string | null;
  companyWide: boolean;
};

export const getScope = cache(async (user: CurrentUser): Promise<Scope> => {
  if (!isCompanyWide(user.role)) {
    return { teamId: user.teamId, squadId: user.squadId ?? NO_SQUAD, companyWide: false };
  }
  const picked = (await cookies()).get(SQUAD_COOKIE)?.value;
  const squad = picked
    ? await prisma.squad.findFirst({ where: { id: picked, teamId: user.teamId, active: true }, select: { id: true } })
    : null;
  return { teamId: user.teamId, squadId: squad?.id ?? null, companyWide: true };
});

/** Users, clients and tasks: they carry teamId and squadId themselves. */
export function inSquad(s: Scope) {
  return s.squadId ? { teamId: s.teamId, squadId: s.squadId } : { teamId: s.teamId };
}

/** Looking up one user, client or task by id. Admin and HR reach any team's
 *  record even while the switcher shows one team; others only their own. */
export function reachable(s: Scope) {
  return s.companyWide ? { teamId: s.teamId } : inSquad(s);
}

/** Notices: the team's own plus company-wide ones (squadId null). */
export function noticesIn(s: Scope) {
  return s.squadId ? { teamId: s.teamId, OR: [{ squadId: s.squadId }, { squadId: null }] } : { teamId: s.teamId };
}

/** Rows owned by a person (attendance, leave, shifts, payroll lines). Combine with the row's own team filter. */
export function byPeopleIn(s: Scope) {
  return s.squadId ? { user: { teamId: s.teamId, squadId: s.squadId } } : { user: { teamId: s.teamId } };
}

/** Rows owned by a client (listings, knowledge base, files). */
export function byClientsIn(s: Scope) {
  return s.squadId ? { client: { teamId: s.teamId, squadId: s.squadId } } : { client: { teamId: s.teamId } };
}

/** Guest stays: their listing's team. Stays not matched to a listing yet are a shared triage queue. */
export function byListingIn(s: Scope) {
  return s.squadId ? { OR: [{ propertyId: null }, { property: { client: { squadId: s.squadId } } }] } : {};
}

/** Can this scope act on a row from `squadId`? For checks after a findFirst. */
export function canReach(s: Scope, squadId: string | null | undefined) {
  return !s.squadId || s.companyWide || squadId === s.squadId;
}

/** The team a new task, notice or client gets. */
export function squadForNew(s: Scope) {
  return s.squadId === NO_SQUAD ? null : s.squadId;
}

export type ClientWall = ReturnType<typeof reachable>;

/** For API routes: the company and the clients this request may reach.
 *  With no valid user it matches nothing (the route has already answered 401
 *  for a missing session; this covers a deactivated one). */
export async function walls() {
  const { getCurrentUserOrNull } = await import("@/lib/session");
  const user = await getCurrentUserOrNull();
  if (!user) return { teamId: NO_SQUAD, clientWall: { teamId: NO_SQUAD } as ClientWall, scope: null };
  const scope = await getScope(user);
  return { teamId: user.teamId, clientWall: reachable(scope), scope };
}

/** For services that act on someone else (approving leave, overtime, a
 *  missed punch): the people this actor may act on. Spread into a User
 *  where, or use as `user: peopleActorReaches(actor)` on a relation. */
export function peopleActorReaches(actor: { role: string; squadId?: string | null }) {
  return isCompanyWide(actor.role as AppRole) ? {} : { squadId: actor.squadId ?? NO_SQUAD };
}
