import { PrismaClient } from "@prisma/client";

function createClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    // Password hashes never leave the database by accident: every query
    // omits them unless it explicitly opts back in (only sign-in does, in
    // lib/auth.ts). Before this, full user rows reached employees' browsers
    // via /api/users and the Tasks pages.
    omit: { user: { passwordHash: true } },
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
