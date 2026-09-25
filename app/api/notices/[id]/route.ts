import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { noticeUpdateSchema } from "@/lib/validations";

// Pin/unpin only — content and color are fixed once posted, matching a real
// sticky note (you'd write a new one, not edit the old one).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamId = (session.user as any).teamId as string;
  const role = (session.user as any).role;

  if (!permissions.canPinNotices(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.notice.findFirst({ where: { id: params.id, teamId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = noticeUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const notice = await prisma.notice.update({
    where: { id: params.id },
    data: { pinned: parsed.data.pinned },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });

  return NextResponse.json({ notice });
}

// The note's own author or an admin can take it down — same tier as who's
// allowed to remove a physical note from the board.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamId = (session.user as any).teamId as string;
  const userId = (session.user as any).id as string;
  const role = (session.user as any).role;

  const existing = await prisma.notice.findFirst({ where: { id: params.id, teamId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (existing.authorId !== userId && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.notice.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
