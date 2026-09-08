import { permissions } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getAttendanceHistory } from "@/lib/queries/attendance";
import { Card } from "@/components/ui/card";
import { Badge, statusTone } from "@/components/ui/badge";
import { formatClientDate, formatClientTime, formatMinutesAsHm } from "@/lib/time";
import { EditAttendanceModal } from "@/components/attendance/edit-attendance-modal";
import { notFound } from "next/navigation";

function fmtTime(date: Date | null) {
  if (!date) return "—";
  return formatClientTime(date);
}

export default async function EmployeeAttendanceHistoryPage({ params }: { params: { userId: string } }) {
  const currentUser = await getCurrentUser();
  const canEdit = permissions.canEditAttendance(currentUser.role);

  const employee = await prisma.user.findUnique({ where: { id: params.userId } });
  if (!employee) notFound();

  const history = await getAttendanceHistory(params.userId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{employee.name}&apos;s Attendance History</h1>
        <p className="mt-1 text-sm text-muted-foreground">Last 90 days of recorded attendance.</p>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-2 font-medium">Date</th>
              <th className="px-5 py-2 font-medium">Scheduled In</th>
              <th className="px-5 py-2 font-medium">Actual In</th>
              <th className="px-5 py-2 font-medium">Scheduled Out</th>
              <th className="px-5 py-2 font-medium">Actual Out</th>
              <th className="px-5 py-2 font-medium">Total Hours</th>
              <th className="px-5 py-2 font-medium">Status</th>
              {canEdit && <th className="px-5 py-2 font-medium">Edit</th>}
            </tr>
          </thead>
          <tbody>
            {history.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-muted-foreground">
                  No attendance records for this month.
                </td>
              </tr>
            ) : (
              history.map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-0 hover:bg-muted/20">
                  <td className="px-5 py-3 whitespace-nowrap tabular-nums">
                    {formatClientDate(r.date)}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground tabular-nums">{r.scheduledCheckIn ?? "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground tabular-nums">{fmtTime(r.actualCheckIn)}</td>
                  <td className="px-5 py-3 text-muted-foreground tabular-nums">{r.scheduledCheckOut ?? "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground tabular-nums">{fmtTime(r.actualCheckOut)}</td>
                  <td className="px-5 py-3 text-muted-foreground tabular-nums">
                    {r.totalMinutes != null ? formatMinutesAsHm(r.totalMinutes) : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={statusTone(r.status)}>{r.status.replace(/_/g, " ")}</Badge>
                  </td>
                  {canEdit && (
                    <td className="px-5 py-3">
                      <EditAttendanceModal record={r} />
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
