import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { encode as defaultEncode, decode as defaultDecode } from "next-auth/jwt";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { AUTH_ERROR_INVALID_CREDENTIALS, AUTH_ERROR_ACCOUNT_DISABLED } from "@/lib/auth-errors";

const ONE_DAY_SECONDS = 24 * 60 * 60;
const THIRTY_DAYS_SECONDS = 30 * ONE_DAY_SECONDS;

// Modular auth: swap/extend providers later (Google, Azure AD, etc.) without
// touching the rest of the app — everything reads role/team off the session.
export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: THIRTY_DAYS_SECONDS },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        rememberMe: { label: "Remember me", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error(AUTH_ERROR_INVALID_CREDENTIALS);
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
          include: { team: true },
        });

        // Same generic error for "no such user" and "wrong password" —
        // distinguishing them would let a caller enumerate which emails
        // have accounts. A disabled account is intentionally still
        // distinguished (see AUTH_ERROR_ACCOUNT_DISABLED) since that's a
        // deliberate admin action the user should know to ask about,
        // not something to hide.
        if (!user) throw new Error(AUTH_ERROR_INVALID_CREDENTIALS);
        if (!user.active) throw new Error(AUTH_ERROR_ACCOUNT_DISABLED);

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) throw new Error(AUTH_ERROR_INVALID_CREDENTIALS);

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.avatarUrl ?? undefined,
          role: user.role,
          teamId: user.teamId,
          teamSlug: user.team.slug,
          rememberMe: credentials.rememberMe !== "false",
        } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
        token.teamId = (user as any).teamId;
        token.teamSlug = (user as any).teamSlug;
        token.id = (user as any).id;
        token.rememberMe = (user as any).rememberMe;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).teamId = token.teamId;
        (session.user as any).teamSlug = token.teamSlug;
      }
      return session;
    },
  },
  // Both functions delegate straight to next-auth's own tested
  // encode/decode — decode is untouched (existing sessions keep working
  // exactly as before), and encode only changes which `maxAge` gets baked
  // into the token's expiry: unchecking "Remember me" signs the user out
  // after 1 day instead of the default 30, without needing a shorter-lived
  // cookie or any custom crypto.
  jwt: {
    maxAge: THIRTY_DAYS_SECONDS,
    async encode(params) {
      const rememberMe = (params.token as any)?.rememberMe;
      const maxAge = rememberMe === false ? ONE_DAY_SECONDS : params.maxAge ?? THIRTY_DAYS_SECONDS;
      return defaultEncode({ ...params, maxAge });
    },
    decode: defaultDecode,
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export type AppRole = "ADMIN" | "TEAM_LEAD" | "EMPLOYEE";

// Central permission map — keep role logic here so it stays modular
// and easy to extend for future teams/modules.
export const permissions = {
  canManageShiftSchedule: (role: AppRole) => role === "ADMIN" || role === "TEAM_LEAD",
  canManageClients: (role: AppRole) => role === "ADMIN",
  canEditAttendance: (role: AppRole) => role === "ADMIN" || role === "TEAM_LEAD",
  canManageProperties: (role: AppRole) => role === "ADMIN" || role === "TEAM_LEAD",
  canManageKnowledgeBase: (role: AppRole) => role === "ADMIN" || role === "TEAM_LEAD",
  canManageDiscordSettings: (role: AppRole) => role === "ADMIN",
  canViewAllAttendance: (role: AppRole) => role === "ADMIN" || role === "TEAM_LEAD",
  canAssignTasks: (role: AppRole) => role === "ADMIN" || role === "TEAM_LEAD",
  canManageUsers: (role: AppRole) => role === "ADMIN",
  // Integration connection status is ADMIN-only, same as canManageClients
  // above (a Team Lead operates within existing clients but doesn't touch
  // integration status) — kept as its own key since the task treats them
  // as distinct capabilities even though they resolve the same today.
  canManageIntegrations: (role: AppRole) => role === "ADMIN",
  // Files are an operational module like the knowledge base — Team Leads
  // can manage them day-to-day, everyone on the team can view them.
  canManageClientFiles: (role: AppRole) => role === "ADMIN" || role === "TEAM_LEAD",
  // Per the Google Sheets knowledge-base spec: Admins can create the sheet,
  // trigger a sync, and view the log; everyone else is view-only (the
  // sheet itself is also shared read-only with non-admins — see
  // lib/google-sheets/spreadsheet.ts's shareWithTeam).
  canManageGoogleSheets: (role: AppRole) => role === "ADMIN",
  // Anyone can post a sticky note — it's a team bulletin board, not a
  // moderated feed. Pinning (keeping an announcement above the regular
  // notes) is the one privileged action, same tier as shift scheduling.
  canPinNotices: (role: AppRole) => role === "ADMIN" || role === "TEAM_LEAD",
};
