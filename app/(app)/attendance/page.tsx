import Link from "next/link";
import { permissions } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { getTodayAttendance, getMonthlyAttendance } from "@/lib/queries/attendance";
import { AttendanceTable } from "@/components/attendance/attendance-table";
import { MonthlySummary } from "@/components/attendance/monthly-summary";
import { MonthSelector } from "@/components/attendance/month-selector";
import { Button } from "@/components/ui/button";
import { CalendarClock } from "lucide-react";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: { year?: string; month?: string };
}) {
  const currentUser = await getCurrentUser();

  const now = new Date();
  const year = searchParams.year ? Number(searchParams.year) : now.getFullYear();
  const month = searchParams.month ? Number(searchParams.month) : now.getMonth();

  const [todayRows, monthlyRows] = await Promise.all([
    getTodayAttendance(currentUser.teamId),
    getMonthlyAttendance(currentUser.teamId, year, month),
  ]);

  const canEdit = permissions.canEditAttendance(currentUser.role);

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Attendance</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Today's check-ins, check-outs, and monthly totals. Expected shift times come
            from the{" "}
            <Link href="/shift-schedule" className="text-primary hover:underline">
              Shift Schedule
            </Link>
            .
          </p>
        </div>
        {canEdit && (
          <Link href="/shift-schedule">
            <Button variant="secondary" size="md">
              <CalendarClock className="h-4 w-4" /> Manage Shift Schedule
            </Button>
          </Link>
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
            Monthly Working Hours
          </h2>
          <MonthSelector year={year} month={month} />
        </div>
        <MonthlySummary rows={monthlyRows} />
      </div>
    </div>
  );
}
