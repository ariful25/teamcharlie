import { getScope } from "@/lib/scope";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserOrNull } from "@/lib/session";
import { permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { shiftAssignmentUpdateSchema } from "@/lib/validations";
import { scopeReachesUser, teamOwnsShiftType } from "@/lib/tenancy";

const bodySchema = shiftAssignmentUpdateSchema.extend({
  userId: z.string(),
  date: z.string(), // ISO date
});

export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUserOrNull();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const scope = await getScope(currentUser);

  if (!permissions.canManageShiftSchedule(currentUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { userId, date, ...rest } = parsed.data;
  if (!(await scopeReachesUser(scope, userId))) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }
  if (!(await teamOwnsShiftType(currentUser.teamId, rest.shiftTypeId))) {
    return NextResponse.json({ error: "Invalid shiftTypeId" }, { status: 400 });
  }
  const day = new Date(`${date.slice(0, 10)}T00:00:00.000Z`);

  const assignment = await prisma.shiftAssignment.upsert({
    where: { userId_date: { userId, date: day } },
    update: rest,
    create: { userId, date: day, createdBy: currentUser.id, ...rest },
  });

  return NextResponse.json({ assignment });
}
