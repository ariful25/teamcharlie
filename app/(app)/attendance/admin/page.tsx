import { byPeopleIn, getScope, inSquad } from "@/lib/scope";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { permissions } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getTeamTimezone } from "@/lib/team-timezone";
import { dayKey, startOfDayUTC } from "@/lib/time";
import { getOvertimeBoard, getReviewQueue, getTeamDay } from "@/lib/queries/attendance";
import { TeamAttendanceConsole } from "@/components/attendance/team-attendance-console";
import { leaveViews } from "@/lib/leave/service";

export default async function TeamAttendancePage(props: { searchParams: Promise<{ day?: string; tab?: string }> }) {
  const searchParams = await props.searchParams;
  const currentUser = await getCurrentUser();
  const scope = await getScope(currentUser);
  if (!permissions.canEditAttendance(currentUser.role)) redirect("/attendance");

  const tz = await getTeamTimezone(currentUser.teamId);
  const today = startOfDayUTC(new Date(), tz);
  const day = searchParams.day && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.day) ? new Date(`${searchParams.day}T00:00:00.000Z`) : today;
  const tab = searchParams.tab === "review" || searchParams.tab === "overtime" || searchParams.tab === "leave" ? searchParams.tab : "roster";

  const [teamDay, queue, overtime, people, leavePending, leaveRecent] = await Promise.all([
    getTeamDay(scope, day),
    getReviewQueue(scope),
    getOvertimeBoard(scope),
    prisma.user.findMany({ where: { ...inSquad(scope), active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, role: true } }),
    leaveViews(currentUser.teamId, { status: "PENDING", ...byPeopleIn(scope) }),
    leaveViews(currentUser.teamId, { ...byPeopleIn(scope), status: { in: ["APPROVED", "REJECTED", "CANCELLED"] }, updatedAt: { gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) } }, 40),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/attendance" className="mb-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Back to Attendance
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Team Attendance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Who&apos;s working, who missed a punch and everything waiting for your confirmation, day by day.
        </p>
      </div>

      <TeamAttendanceConsole
        day={dayKey(day)}
        today={dayKey(today)}
        tab={tab}
        roster={teamDay.rows}
        queue={queue}
        overtime={overtime}
        leave={{ pending: leavePending, recent: leaveRecent }}
        employees={people.map((p) => ({ id: p.id, name: p.name }))}
        leads={people.filter((p) => p.role === "ADMIN" || p.role === "TEAM_LEAD").map((p) => ({ id: p.id, name: p.name }))}
        currentUser={{ id: currentUser.id, role: currentUser.role }}
      />
    </div>
  );
}
