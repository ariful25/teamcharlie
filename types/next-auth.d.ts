import { DefaultSession } from "next-auth";

type AppRole = "ADMIN" | "HR" | "TEAM_LEAD" | "EMPLOYEE";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: AppRole;
      teamId: string;
      teamSlug: string;
      /** "client" for a portal session (no role); absent for staff. */
      kind?: "client";
      clientId?: string;
    } & DefaultSession["user"];
  }
  /** What authorize() in lib/auth.ts returns. */
  interface User {
    role?: AppRole;
    teamId: string;
    teamSlug?: string;
    rememberMe?: boolean;
    kind?: "client";
    clientId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: AppRole;
    teamId?: string;
    teamSlug?: string;
    rememberMe?: boolean;
    kind?: "client";
    clientId?: string;
  }
}
