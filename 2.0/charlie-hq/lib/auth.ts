import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// Modular auth: swap/extend providers later (Google, Azure AD, etc.) without
// touching the rest of the app — everything reads role/team off the session.
export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
          include: { team: true },
        });

        if (!user || !user.active) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.avatarUrl ?? undefined,
          role: user.role,
          teamId: user.teamId,
          teamSlug: user.team.slug,
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
  secret: process.env.NEXTAUTH_SECRET,
};

export type AppRole = "ADMIN" | "TEAM_LEAD" | "EMPLOYEE";

// Central permission map — keep role logic here so it stays modular
// and easy to extend for future teams/modules.
export const permissions = {
  canManageShiftSchedule: (role: AppRole) => role === "ADMIN" || role === "TEAM_LEAD",
  canManageClients: (role: AppRole) => role === "ADMIN",
  canEditAttendance: (role: AppRole) => role === "ADMIN" || role === "TEAM_LEAD",
  canManageDiscordSettings: (role: AppRole) => role === "ADMIN",
  canViewAllAttendance: (role: AppRole) => role === "ADMIN" || role === "TEAM_LEAD",
  canAssignTasks: (role: AppRole) => role === "ADMIN" || role === "TEAM_LEAD",
  canManageUsers: (role: AppRole) => role === "ADMIN",
};
