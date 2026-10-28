import { cache } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import type { AppRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  teamId: string;
  teamSlug: string;
  /** Their team inside the company. Null for Admin and HR (company-wide). */
  squadId: string | null;
};

/** The signed-in user, or null when there's no complete session. A session
 *  without an id or teamId is treated as signed out: a missing teamId would
 *  turn `where: { teamId }` into "every team" in Prisma.
 *
 *  Role, team and active are read from the database, not the token: a person
 *  moved to another team, demoted or deactivated loses access on their next
 *  request instead of when their 30-day token runs out. One indexed lookup,
 *  shared by everything in the same request (React cache). */
const readUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getServerSession(authOptions);
  const token = session?.user;
  if (!token?.id || !token.teamId || !token.role) return null;
  const user = await prisma.user.findUnique({
    where: { id: token.id },
    select: { name: true, email: true, role: true, teamId: true, squadId: true, active: true },
  });
  if (!user?.active || user.teamId !== token.teamId) return null;
  return {
    id: token.id,
    name: user.name,
    email: user.email,
    role: user.role,
    teamId: user.teamId,
    teamSlug: token.teamSlug ?? "",
    squadId: user.squadId,
  };
});

/**
 * The single place every Server Component/route should get the current user
 * from. Redirects to /login when there's no complete session.
 */
export async function getCurrentUser(): Promise<CurrentUser> {
  const user = await readUser();
  if (!user) redirect("/login");
  return user;
}

/** Same as getCurrentUser, but returns null instead of redirecting — for API
 *  routes that answer 401 rather than redirect. */
export async function getCurrentUserOrNull(): Promise<CurrentUser | null> {
  return readUser();
}
