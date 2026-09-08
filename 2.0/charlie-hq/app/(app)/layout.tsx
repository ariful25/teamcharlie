import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const currentUser = await getCurrentUser();

  const user = await prisma.user.findUnique({
    where: { id: currentUser.id },
    include: { team: true },
  });

  if (!user) {
    // Account was deactivated/removed after the session token was issued.
    redirect("/login");
  }

  const todayRecord = await prisma.attendanceRecord.findFirst({
    where: {
      userId: user.id,
      date: new Date(new Date().toISOString().slice(0, 10)),
    },
  });

  const checkedIn = !!todayRecord?.actualCheckIn && !todayRecord?.actualCheckOut;

  return (
    <div className="flex min-h-screen">
      <Sidebar
        user={{
          name: user.name,
          role: user.role,
          avatarUrl: user.avatarUrl,
        }}
        checkedIn={checkedIn}
      />
      <div className="flex-1 pb-20 md:pb-0 md:pl-64">
        <main className="mx-auto max-w-[1600px] px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
      <MobileNav />
    </div>
  );
}
