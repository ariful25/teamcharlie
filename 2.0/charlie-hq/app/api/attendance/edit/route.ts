import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { attendanceEditSchema } from "@/lib/validations";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!permissions.canEditAttendance(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = (session.user as any).id as string;
  const body = await req.json();
  const parsed = attendanceEditSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const data = parsed.data;

  const existing = await prisma.attendanceRecord.findUniqueOrThrow({ where: { id: data.recordId } });

  let totalMinutes = existing.totalMinutes;
  const checkIn = data.actualCheckIn ? new Date(data.actualCheckIn) : existing.actualCheckIn;
  const checkOut = data.actualCheckOut ? new Date(data.actualCheckOut) : existing.actualCheckOut;
  if (checkIn && checkOut) {
    totalMinutes = Math.round((checkOut.getTime() - checkIn.getTime()) / 60000);
  }

  let status = existing.status;
  if (checkIn && !checkOut) status = "CHECKED_IN";
  if (checkIn && checkOut) status = "CHECKED_OUT";
  if (!checkIn) status = "MISSING_CHECK_IN";

  const record = await prisma.attendanceRecord.update({
    where: { id: data.recordId },
    data: {
      actualCheckIn: checkIn,
      actualCheckOut: checkOut,
      totalMinutes,
      status,
      editedBy: userId,
      editedAt: new Date(),
      editReason: data.reason,
    },
  });

  return NextResponse.json({ record });
}
