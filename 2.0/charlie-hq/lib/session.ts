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

/**
 * The single place every Server Component/route should get the current user from.
 * Replaces the previous fragile `session!.user` pattern, which threw a hard
 * null-reference error on refresh/direct-visit races instead of redirecting
 * cleanly to /login. Always awaits and null-checks the session before touching it.
 */
export async function getCurrentUser(): Promise<CurrentUser> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }
  const user = session.user as any;
  return {
    id: user.id,
    name: user.name ?? "",
    email: user.email ?? "",
    role: user.role,
    teamId: user.teamId,
    teamSlug: user.teamSlug,
  };
}

/** Same as getCurrentUser, but returns null instead of redirecting — for places
 * (like API routes) that need to return a 401 response rather than a redirect. */
export async function getCurrentUserOrNull(): Promise<CurrentUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const user = session.user as any;
  return {
    id: user.id,
    name: user.name ?? "",
    email: user.email ?? "",
    role: user.role,
    teamId: user.teamId,
    teamSlug: user.teamSlug,
  };
}
