import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { noticeSchema } from "@/lib/validations";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamId = (session.user as any).teamId as string;

  const notices = await prisma.notice.findMany({
    where: { teamId },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ notices });
}

// Anyone on the team can post a sticky note — see the canPinNotices comment
// in lib/auth.ts for why pinning (not posting) is the privileged action.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamId = (session.user as any).teamId as string;
  const authorId = (session.user as any).id as string;
  const body = await req.json();
  const parsed = noticeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const notice = await prisma.notice.create({
    data: {
      content: parsed.data.content,
      color: parsed.data.color,
      checklist: parsed.data.checklist ?? undefined,
      authorId,
      teamId,
    },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });

  return NextResponse.json({ notice });
}
