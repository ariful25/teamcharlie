import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserOrNull } from "@/lib/session";
import { permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createUserSchema } from "@/lib/validations";
import bcrypt from "bcryptjs";
import crypto from "crypto";

export async function GET() {
  const currentUser = await getCurrentUserOrNull();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await prisma.user.findMany({
    where: { teamId: currentUser.teamId },
    orderBy: { name: "asc" },
    include: { defaultShiftType: true },
  });
  return NextResponse.json({ users });
}

function generateTempPassword() {
  // 10-character, easy-to-relay-over-chat temporary password
  return crypto.randomBytes(8).toString("base64url").slice(0, 10);
}

export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUserOrNull();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!permissions.canManageUsers(currentUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const data = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (existing) {
    return NextResponse.json({ error: "A user with that email already exists" }, { status: 409 });
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email.toLowerCase(),
      passwordHash,
      role: data.role,
      teamId: currentUser.teamId,
      defaultShiftTypeId: data.defaultShiftTypeId || null,
    },
  });

  // Returned once, never stored in plaintext or logged — the admin relays it to the
  // new hire directly. The account's real bcrypt hash is what's persisted above.
  return NextResponse.json({ user, tempPassword });
}
