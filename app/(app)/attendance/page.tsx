import Link from "next/link";
import { CalendarClock, ShieldCheck } from "lucide-react";
import { permissions } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getTeamTimezone } from "@/lib/team-timezone";
import { dayAsTeamInstant, dayKey, formatDateLong, startOfDayUTC } from "@/lib/time";
import {
  getEmployeeShifts,
  getMyOvertime,
  getPeriodSummary,
  getReviewQueue,
  getShiftCardState,
  monthRange,
  weekRange,
} from "@/lib/queries/attendance";
import { Button } from "@/components/ui/button";
import { ShiftCard } from "@/components/dashboard/shift-card";
import { MyAttendance } from "@/components/attendance/my-attendance";
import { PeriodTable } from "@/components/attendance/period-table";
import { MonthSelector } from "@/components/attendance/month-selector";
import { WeekSelector } from "@/components/attendance/week-selector";
import { Panel, StatTile } from "@/components/attendance/ui";
import { LeavePanel } from "@/components/attendance/leave-panel";
import { leaveBalances, leaveViews } from "@/lib/leave/service";
import { hm } from "@/lib/attendance/format";

export default async function AttendancePage(
  props: { searchParams: Promise<{ year?: string; month?: string; weekStart?: string }> }
) {
  const searchParams = await props.searchParams;
  const currentUser = await getCurrentUser();
  const tz = await getTeamTimezone(currentUser.teamId);
  const isLead = permissions.canEditAttendance(currentUser.role);

  const now = new Date();
  const today = startOfDayUTC(now, tz);
  const year = searchParams.year ? Number(searchParams.year) : today.getUTCFullYear();
  const month = searchParams.month ? Number(searchParams.month) : today.getUTCMonth();
  const weekAnchor = searchParams.weekStart ? dayAsTeamInstant(new Date(`${searchParams.weekStart}T00:00:00.000Z`), tz) : now;
  const week = await weekRange(currentUser.teamId, weekAnchor);
  const thisWeek = await weekRange(currentUser.teamId, now);
  const thisMonth = monthRange(today.getUTCFullYear(), today.getUTCMonth());
  const selectedMonth = monthRange(year, month);
  const onlyMe = isLead ? undefined : currentUser.id;

  const [shiftState, mine, myOvertime, myWeek, myMonth, weekRows, monthRows, queue, leads, checklist, balances, myLeave] = await Promise.all([
    getShiftCardState(currentUser.id),
    getEmployeeShifts(currentUser.teamId, currentUser.id, 14),
    getMyOvertime(currentUser.id),
    getPeriodSummary(currentUser.teamId, thisWeek.start, thisWeek.end, currentUser.id),
    getPeriodSummary(currentUser.teamId, thisMonth.start, thisMonth.end, currentUser.id),
    getPeriodSummary(currentUser.teamId, week.start, week.end, onlyMe),
    getPeriodSummary(currentUser.teamId, selectedMonth.start, selectedMonth.end, onlyMe),
    isLead ? getReviewQueue(currentUser.teamId) : Promise.resolve([]),
    prisma.user.findMany({
      where: { teamId: currentUser.teamId, active: true, role: { in: ["ADMIN", "TEAM_LEAD"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.checklistItem.findMany({ where: { teamId: currentUser.teamId, type: "CHECKOUT", active: true }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] }),
    leaveBalances(currentUser.id, currentUser.teamId, today.getUTCFullYear()),
    leaveViews(currentUser.teamId, { userId: currentUser.id }, 10),
  ]);

  const w = myWeek[0];
  const m = myMonth[0];

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-medium text-primary">{formatDateLong(now, tz)}</p>
          <h1 className="font-display text-2xl font-semibold md:text-3xl">Attendance</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your shifts, hours and requests. Expected times come from the{" "}
            <Link href="/shift-schedule" className="text-primary hover:underline">
              Shift Schedule
            </Link>
            .
          </p>
        </div>
        {isLead && (
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/attendance/admin?tab=review">
              <Button variant={queue.length ? "primary" : "secondary"}>
                <ShieldCheck className="h-4 w-4" /> Team Attendance
                {queue.length > 0 && <span className="rounded-full bg-background/30 px-1.5 text-xs">{queue.length} to review</span>}
              </Button>
            </Link>
            <Link href="/shift-schedule">
              <Button variant="secondary">
                <CalendarClock className="h-4 w-4" /> Shift Schedule
              </Button>
            </Link>
          </div>
        )}
      </div>

      <div className="grid gap-8 lg:grid-cols-golden-r">
        <ShiftCard state={shiftState} checklistItems={checklist.map((c) => ({ id: c.id, label: c.label }))} leads={leads} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Paid this week" value={hm((w?.regularMinutes ?? 0) + (w?.overtimeMinutes ?? 0))} hint={`of ${hm(w?.scheduledMinutes ?? 0)} scheduled`} tone="primary" />
          <StatTile label="Overtime this week" value={hm(w?.overtimeMinutes ?? 0)} hint="approved only" tone="accent" />
          <StatTile label="Pending review" value={hm((w?.pendingMinutes ?? 0))} hint={`${w?.needsReview ?? 0} shift(s)`} tone={w?.needsReview ? "warning" : "muted"} />
          <StatTile label="Late this week" value={w?.lateCount ?? 0} hint="incl. missed check-ins" tone={w?.lateCount ? "warning" : "muted"} />
          <StatTile label="Paid this month" value={hm((m?.regularMinutes ?? 0) + (m?.overtimeMinutes ?? 0))} hint={`of ${hm(m?.scheduledMinutes ?? 0)} scheduled`} tone="primary" />
          <StatTile label="Overtime this month" value={hm(m?.overtimeMinutes ?? 0)} tone="accent" />
          <StatTile label="Unapproved extra" value={hm(m?.extraMinutes ?? 0)} hint="this month · not paid" tone={m?.extraMinutes ? "danger" : "muted"} />
          <StatTile label="Missed punches" value={m?.missedPunches ?? 0} hint="this month" tone={m?.missedPunches ? "danger" : "muted"} />
        </div>
      </div>

      <MyAttendance shifts={mine?.shifts ?? []} overtime={myOvertime} leads={leads} today={dayKey(today)} />

      <LeavePanel balances={balances} requests={myLeave} today={dayKey(today)} />

      <Panel title={isLead ? "Weekly hours — team" : "Weekly hours"} action={<WeekSelector weekStart={week.start} />}>
        <PeriodTable rows={weekRows} emptyLabel="No attendance this week." linkRows={isLead} />
      </Panel>

      <Panel title={isLead ? "Monthly hours — team" : "Monthly hours"} action={<MonthSelector year={year} month={month} />}>
        <PeriodTable rows={monthRows} linkRows={isLead} />
      </Panel>
    </div>
  );
}
