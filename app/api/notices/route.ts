import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { noticeSchema } from "@/lib/validations";
import { pushNoticePosted } from "@/lib/push/notify";
import { noticesIn, squadForNew, walls } from "@/lib/scope";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { scope } = await walls();
  if (!scope) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const notices = await prisma.notice.findMany({
    where: noticesIn(scope),
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

  const { teamId, scope } = await walls();
  if (!scope) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const authorId = session.user.id as string;
  const body = await req.json().catch(() => ({}));
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
      // A lead's or employee's notice belongs to their team. Admin and HR
      // post to the team picked in the switcher, or company-wide on "All teams".
      squadId: squadForNew(scope),
    },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });

  await pushNoticePosted(teamId, notice, { id: authorId, name: notice.author.name });

  return NextResponse.json({ notice });
}
