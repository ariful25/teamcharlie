import { DefaultSession } from "next-auth";

type AppRole = "ADMIN" | "TEAM_LEAD" | "EMPLOYEE";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: AppRole;
      teamId: string;
      teamSlug: string;
    } & DefaultSession["user"];
  }
  /** What authorize() in lib/auth.ts returns. */
  interface User {
    role: AppRole;
    teamId: string;
    teamSlug: string;
    rememberMe?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: AppRole;
    teamId?: string;
    teamSlug?: string;
    rememberMe?: boolean;
  }
}
