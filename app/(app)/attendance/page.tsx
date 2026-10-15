import Link from "next/link";
import { permissions } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { getTodayAttendance, getMonthlyAttendance, getWeeklyAttendance } from "@/lib/queries/attendance";
import { AttendanceTable } from "@/components/attendance/attendance-table";
import { MonthlySummary } from "@/components/attendance/monthly-summary";
import { MonthSelector } from "@/components/attendance/month-selector";
import { WeekSelector } from "@/components/attendance/week-selector";
import { Button } from "@/components/ui/button";
import { CalendarClock, ShieldCheck } from "lucide-react";
import { startOfWeekMonday } from "@/lib/time";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: { year?: string; month?: string; weekStart?: string };
}) {
  const currentUser = await getCurrentUser();

  const now = new Date();
  const year = searchParams.year ? Number(searchParams.year) : now.getFullYear();
  const month = searchParams.month ? Number(searchParams.month) : now.getMonth();
  const weekStartParam = searchParams.weekStart ? new Date(`${searchParams.weekStart}T00:00:00.000Z`) : now;

  const [todayRows, monthlyRows, weekly] = await Promise.all([
    getTodayAttendance(currentUser.teamId),
    getMonthlyAttendance(currentUser.teamId, year, month),
    getWeeklyAttendance(currentUser.teamId, weekStartParam),
  ]);

  const canEdit = permissions.canEditAttendance(currentUser.role);

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Attendance</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Today&apos;s check-ins, check-outs, and monthly totals. Expected shift times come
            from the{" "}
            <Link href="/shift-schedule" className="text-primary hover:underline">
              Shift Schedule
            </Link>
            .
          </p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Link href="/attendance/admin">
              <Button variant="secondary" size="md">
                <ShieldCheck className="h-4 w-4" /> Team Attendance (Admin)
              </Button>
            </Link>
            <Link href="/shift-schedule">
              <Button variant="secondary" size="md">
                <CalendarClock className="h-4 w-4" /> Manage Shift Schedule
              </Button>
            </Link>
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Today
        </h2>
        <AttendanceTable rows={todayRows} canEdit={canEdit} />
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Weekly Working Hours
          </h2>
          <WeekSelector weekStart={startOfWeekMonday(weekStartParam)} />
        </div>
        <MonthlySummary rows={weekly.rows} emptyLabel="No attendance records for this week." />
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Monthly Working Hours
          </h2>
          <MonthSelector year={year} month={month} />
        </div>
        <MonthlySummary rows={monthlyRows} />
      </div>
    </div>
  );
}
