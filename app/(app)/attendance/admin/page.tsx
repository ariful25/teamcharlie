import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { permissions } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { getAdminAttendanceOverview } from "@/lib/queries/attendance";
import { AdminAttendanceOverview } from "@/components/attendance/admin-attendance-overview";

export default async function AdminAttendancePage() {
  const currentUser = await getCurrentUser();
  if (!permissions.canEditAttendance(currentUser.role)) {
    redirect("/attendance");
  }

  const rows = await getAdminAttendanceOverview(currentUser.teamId);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/attendance" className="mb-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Back to Attendance
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Team Attendance — Admin</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone&apos;s status for today, at a glance — who&apos;s working now, who&apos;s missing a punch, and quick
          access to correct it.
        </p>
      </div>

      <AdminAttendanceOverview rows={rows} />
    </div>
  );
}
