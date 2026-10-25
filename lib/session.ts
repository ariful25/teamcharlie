import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import type { AppRole } from "@/lib/auth";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  teamId: string;
  teamSlug: string;
};

/** The signed-in user, or null when there's no complete session. A session
 *  without an id or teamId is treated as signed out: a missing teamId would
 *  turn `where: { teamId }` into "every team" in Prisma. */
async function readUser(): Promise<CurrentUser | null> {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user?.id || !user.teamId || !user.role) return null;
  return {
    id: user.id,
    name: user.name ?? "",
    email: user.email ?? "",
    role: user.role,
    teamId: user.teamId,
    teamSlug: user.teamSlug ?? "",
  };
}

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
