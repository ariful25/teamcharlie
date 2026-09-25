import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { permissions } from "@/lib/auth";
import { NoticeBoard } from "@/components/notices/notice-board";

export default async function NoticesPage() {
  const currentUser = await getCurrentUser();

  const notices = await prisma.notice.findMany({
    where: { teamId: currentUser.teamId },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
  });

  const plainNotices = JSON.parse(JSON.stringify(notices));
  const canPinNotices = permissions.canPinNotices(currentUser.role);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Notices</h1>
        <p className="mt-1 text-sm text-muted-foreground">The team&apos;s shared notice board — post a reminder or tip for everyone to see.</p>
      </div>
      <NoticeBoard
        notices={plainNotices}
        currentUserId={currentUser.id}
        currentUserRole={currentUser.role}
        canPinNotices={canPinNotices}
      />
    </div>
  );
}
