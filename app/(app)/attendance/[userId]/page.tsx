import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { permissions } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { getTeamTimezone } from "@/lib/team-timezone";
import { dayKey, startOfDayUTC } from "@/lib/time";
import { getEmployeeShifts, getPeriodSummary, monthRange } from "@/lib/queries/attendance";
import { EmployeeShifts } from "@/components/attendance/employee-shifts";
import { StatTile } from "@/components/attendance/ui";
import { hm } from "@/lib/attendance/format";

export default async function EmployeeAttendancePage({ params }: { params: { userId: string } }) {
  const currentUser = await getCurrentUser();
  const canReview = permissions.canEditAttendance(currentUser.role);
  // Employees can only see their own history.
  if (!canReview && params.userId !== currentUser.id) redirect("/attendance");

  const tz = await getTeamTimezone(currentUser.teamId);
  const today = startOfDayUTC(new Date(), tz);
  const month = monthRange(today.getUTCFullYear(), today.getUTCMonth());
  const [history, summary] = await Promise.all([
    getEmployeeShifts(currentUser.teamId, params.userId, 45),
    getPeriodSummary(currentUser.teamId, month.start, month.end, params.userId),
  ]);
  if (!history) notFound();
  const m = summary[0];

  return (
    <div className="space-y-8">
      <div>
        <Link href={canReview ? "/attendance/admin" : "/attendance"} className="mb-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Back
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{history.user.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Attendance history and this month&apos;s hours.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Scheduled" value={hm(m?.scheduledMinutes ?? 0)} hint="this month" tone="muted" />
        <StatTile label="Paid regular" value={hm(m?.regularMinutes ?? 0)} tone="primary" />
        <StatTile label="Approved OT" value={hm(m?.overtimeMinutes ?? 0)} tone="accent" />
        <StatTile label="Pending" value={hm(m?.pendingMinutes ?? 0)} hint={`${m?.needsReview ?? 0} to review`} tone={m?.needsReview ? "warning" : "muted"} />
        <StatTile label="Unapproved extra" value={hm(m?.extraMinutes ?? 0)} hint="not paid" tone={m?.extraMinutes ? "danger" : "muted"} />
        <StatTile label="Late / missed" value={`${m?.lateCount ?? 0} / ${m?.missedPunches ?? 0}`} tone={m?.lateCount || m?.missedPunches ? "warning" : "muted"} />
      </div>

      <EmployeeShifts
        shifts={history.shifts}
        today={dayKey(today)}
        canReview={canReview}
        currentUser={{ id: currentUser.id, role: currentUser.role }}
      />
    </div>
  );
}
