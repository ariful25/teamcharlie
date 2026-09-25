import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { noticeUpdateSchema } from "@/lib/validations";

// Pin, archive, and checklist-item toggles each send only the one field that
// changed, so each gets its own permission check rather than one gate for
// the whole route. Content/color/checklist item text are fixed once posted
// — you'd write a new note, not edit the old one — the checklist field here
// only ever replaces the whole array wholesale (toggling an item's
// `checked`), never adds/removes/retexts items after creation.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamId = (session.user as any).teamId as string;
  const userId = (session.user as any).id as string;
  const role = (session.user as any).role;

  const existing = await prisma.notice.findFirst({ where: { id: params.id, teamId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = noticeUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  if (parsed.data.pinned !== undefined && !permissions.canPinNotices(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Archiving is the same tier as delete — the note's own author or an
  // admin — since it's the "take this off my board" action, not a shared
  // moderation one.
  if (parsed.data.archived !== undefined && existing.authorId !== userId && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Checklist items are collaborative by design (e.g. a shared supply-run
  // list) — any team member can check them off, not just the author.

  const notice = await prisma.notice.update({
    where: { id: params.id },
    data: {
      ...(parsed.data.pinned !== undefined ? { pinned: parsed.data.pinned } : {}),
      ...(parsed.data.archived !== undefined ? { archived: parsed.data.archived } : {}),
      ...(parsed.data.checklist !== undefined ? { checklist: parsed.data.checklist } : {}),
    },
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
