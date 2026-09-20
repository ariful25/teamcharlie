import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { MobileTopbar } from "@/components/layout/mobile-topbar";
import { TooltipProvider } from "@/components/ui/tooltip";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const currentUser = await getCurrentUser();

  const user = await prisma.user.findUnique({
    where: { id: currentUser.id },
    include: { team: true },
  });

  if (!user || !user.active) {
    // Account was deactivated or removed after the session token was
    // issued — the JWT itself is still valid, so this DB check is what
    // actually locks a deactivated user out mid-session instead of only
    // preventing their next fresh login.
    redirect("/login?disabled=1");
  }

  const todayRecord = await prisma.attendanceRecord.findFirst({
    where: {
      userId: user.id,
      actualCheckIn: { not: null },
      actualCheckOut: null,
    },
    orderBy: { date: "desc" },
  });

  const checkedIn = !!todayRecord;

  const clients = await prisma.client.findMany({
    where: { teamId: user.teamId, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex min-h-screen">
        <Sidebar
          user={{
            name: user.name,
            role: user.role,
            avatarUrl: user.avatarUrl,
          }}
          checkedIn={checkedIn}
          clients={clients}
        />
        {/* min-w-0 overrides a flex item's default min-width:auto — without
            it, wide unwrapped content (e.g. the Tasks Kanban board) forces
            this whole column wider instead of scrolling inside itself,
            causing real page-level horizontal scroll on mobile. */}
        <div className="min-w-0 flex-1 pb-20 md:pb-0 md:pl-64">
          <MobileTopbar userName={user.name} />
          <main className="mx-auto max-w-[1600px] px-4 py-6 md:px-8 md:py-8">{children}</main>
        </div>
        <MobileNav />
      </div>
    </TooltipProvider>
  );
}
