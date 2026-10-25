import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserOrNull } from "@/lib/session";
import { permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateUserSchema } from "@/lib/validations";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const currentUser = await getCurrentUserOrNull();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!permissions.canManageUsers(currentUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  if (params.id === currentUser.id && body.active === false) {
    return NextResponse.json({ error: "You can't deactivate your own account" }, { status: 400 });
  }

  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  // Team check before the write — without it an admin of one team could edit
  // (or disable, or promote) any user on the platform by id.
  const existing = await prisma.user.findFirst({ where: { id: params.id, teamId: currentUser.teamId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Never leave a team without an active admin — nobody could manage users,
  // settings or payroll again, and there's no in-app way back.
  const losesAdmin = existing.role === "ADMIN" && existing.active && ((parsed.data.role && parsed.data.role !== "ADMIN") || parsed.data.active === false);
  if (losesAdmin) {
    const otherAdmins = await prisma.user.count({ where: { teamId: currentUser.teamId, role: "ADMIN", active: true, id: { not: existing.id } } });
    if (otherAdmins === 0) {
      return NextResponse.json({ error: "Make someone else an admin first — a team always needs at least one active admin." }, { status: 400 });
    }
  }

  const user = await prisma.user.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json({ user });
}
