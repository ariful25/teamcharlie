import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { encode as defaultEncode, decode as defaultDecode } from "next-auth/jwt";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { AUTH_ERROR_INVALID_CREDENTIALS, AUTH_ERROR_ACCOUNT_DISABLED, AUTH_ERROR_TOO_MANY_ATTEMPTS } from "@/lib/auth-errors";
import { clear, clientIp, hit, LOGIN_MAX_PER_ACCOUNT, LOGIN_MAX_PER_IP, LOGIN_WINDOW_MS, peek } from "@/lib/rate-limit";

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
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error(AUTH_ERROR_INVALID_CREDENTIALS);
        }

        // Brute-force guard, shared across server instances (lib/rate-limit.ts).
        const accountKey = `login:account:${credentials.email.toLowerCase()}`;
        const ipKey = `login:ip:${clientIp(req?.headers ?? {})}`;
        if ((await peek(accountKey)) >= LOGIN_MAX_PER_ACCOUNT || (await peek(ipKey)) >= LOGIN_MAX_PER_IP) {
          throw new Error(AUTH_ERROR_TOO_MANY_ATTEMPTS);
        }
        const fail = async (code: string) => {
          await Promise.all([hit(accountKey, LOGIN_WINDOW_MS), hit(ipKey, LOGIN_WINDOW_MS)]);
          throw new Error(code);
        };

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
          include: { team: true },
          // The only query allowed to read the hash (see lib/prisma.ts).
          omit: { passwordHash: false },
        });

        // Same generic error for "no such user" and "wrong password" —
        // distinguishing them would let a caller enumerate which emails
        // have accounts. A disabled account is intentionally still
        // distinguished (see AUTH_ERROR_ACCOUNT_DISABLED) since that's a
        // deliberate admin action the user should know to ask about,
        // not something to hide.
        if (!user) return fail(AUTH_ERROR_INVALID_CREDENTIALS);
        if (!user.active) throw new Error(AUTH_ERROR_ACCOUNT_DISABLED);

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return fail(AUTH_ERROR_INVALID_CREDENTIALS);
        await clear(accountKey);

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.avatarUrl ?? undefined,
          role: user.role,
          teamId: user.teamId,
          teamSlug: user.team.slug,
          rememberMe: credentials.rememberMe !== "false",
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.teamId = user.teamId;
        token.teamSlug = user.teamSlug;
        token.id = user.id;
        token.rememberMe = user.rememberMe;
      }
      return token;
    },
    async session({ session, token }) {
      // An incomplete token (malformed, or from before teams existed) gets NO
      // user: every route then answers 401. Never let it through with
      // teamId undefined — Prisma reads `where: { teamId: undefined }` as
      // "no filter", which would return every team's data.
      if (!session.user || !token.id || !token.role || !token.teamId) {
        return { expires: session.expires } as typeof session;
      }
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.teamId = token.teamId;
      session.user.teamSlug = token.teamSlug ?? "";
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
      const rememberMe = params.token?.rememberMe;
      const maxAge = rememberMe === false ? ONE_DAY_SECONDS : params.maxAge ?? THIRTY_DAYS_SECONDS;
      return defaultEncode({ ...params, maxAge });
    },
    decode: defaultDecode,
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export type AppRole = "ADMIN" | "HR" | "TEAM_LEAD" | "EMPLOYEE";

/** Admin and HR work across every team in the company; everyone else in one. */
export const isCompanyWide = (role: AppRole) => role === "ADMIN" || role === "HR";

// Central permission map — keep role logic here so it stays modular
// and easy to extend for future teams/modules.
export const permissions = {
  canManageShiftSchedule: (role: AppRole) => role === "ADMIN" || role === "TEAM_LEAD",
  // Same tier as shift types — operational config, not a secret.
  canManageChecklists: (role: AppRole) => role === "ADMIN" || role === "TEAM_LEAD",
  canManageClients: (role: AppRole) => role === "ADMIN",
  canEditAttendance: (role: AppRole) => role === "ADMIN" || role === "HR" || role === "TEAM_LEAD",
  canManageProperties: (role: AppRole) => role === "ADMIN" || role === "TEAM_LEAD",
  canManageKnowledgeBase: (role: AppRole) => role === "ADMIN" || role === "TEAM_LEAD",
  // Gates both the Discord and Slack settings panels/test-notification
  // routes — same tier, kept as one key since they're managed together.
  canManageNotificationSettings: (role: AppRole) => role === "ADMIN",
  canViewAllAttendance: (role: AppRole) => role === "ADMIN" || role === "HR" || role === "TEAM_LEAD",
  canAssignTasks: (role: AppRole) => role === "ADMIN" || role === "TEAM_LEAD",
  canManageUsers: (role: AppRole) => role === "ADMIN" || role === "HR",
  // Leads add people to their own team (as employees only, see
  // lib/people/adding.ts); Admin and HR to any team, in any role.
  canAddPeople: (role: AppRole) => role === "ADMIN" || role === "HR" || role === "TEAM_LEAD",
  // Creating, renaming and closing teams inside the company.
  canManageSquads: (role: AppRole) => role === "ADMIN",
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
  canPinNotices: (role: AppRole) => role === "ADMIN" || role === "HR" || role === "TEAM_LEAD",
  // Salaries and pay: Admin and HR.
  canManagePayroll: (role: AppRole) => role === "ADMIN" || role === "HR",
};
