import Link from "next/link";
import { Card } from "@/components/ui/card";
import { formatMinutesAsHm } from "@/lib/time";

type Row = {
  employee: { id: string; name: string };
  daysWorked: number;
  totalMinutes: number;
  avgDailyMinutes: number;
  lateCheckIns: number;
  lateCheckOuts: number;
  missingCheckIns: number;
  missingCheckOuts: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  sickLeaveDays: number;
  weekendDays: number;
};

export function MonthlySummary({ rows, emptyLabel = "No attendance records for this month." }: { rows: Row[]; emptyLabel?: string }) {
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2 font-medium">Employee</th>
            <th className="px-4 py-2 font-medium">Days Worked</th>
            <th className="px-4 py-2 font-medium">Total Hours</th>
            <th className="px-4 py-2 font-medium">Avg Daily</th>
            <th className="px-4 py-2 font-medium">Late Check-in</th>
            <th className="px-4 py-2 font-medium">Late Check-out</th>
            <th className="px-4 py-2 font-medium">Missed Check-in</th>
            <th className="px-4 py-2 font-medium">Missed Check-out</th>
            <th className="px-4 py-2 font-medium">Paid Leave</th>
            <th className="px-4 py-2 font-medium">Unpaid Leave</th>
            <th className="px-4 py-2 font-medium">Sick Leave</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={11} className="px-5 py-8 text-center text-muted-foreground">
                {emptyLabel}
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.employee.id} className="border-b border-border/60 last:border-0 hover:bg-muted/20">
                <td className="px-4 py-3">
                  <Link href={`/attendance/${r.employee.id}`} className="font-medium hover:underline">
                    {r.employee.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground tabular-nums">{r.daysWorked}</td>
                <td className="px-4 py-3 text-muted-foreground tabular-nums">{formatMinutesAsHm(r.totalMinutes)}</td>
                <td className="px-4 py-3 text-muted-foreground tabular-nums">{formatMinutesAsHm(r.avgDailyMinutes)}</td>
                <td className={`px-4 py-3 tabular-nums ${r.lateCheckIns > 0 ? "text-warning" : "text-muted-foreground"}`}>{r.lateCheckIns}</td>
                <td className={`px-4 py-3 tabular-nums ${r.lateCheckOuts > 0 ? "text-warning" : "text-muted-foreground"}`}>{r.lateCheckOuts}</td>
                <td className={`px-4 py-3 tabular-nums ${r.missingCheckIns > 0 ? "text-danger" : "text-muted-foreground"}`}>{r.missingCheckIns}</td>
                <td className={`px-4 py-3 tabular-nums ${r.missingCheckOuts > 0 ? "text-danger" : "text-muted-foreground"}`}>{r.missingCheckOuts}</td>
                <td className="px-4 py-3 text-muted-foreground tabular-nums">{r.paidLeaveDays}</td>
                <td className="px-4 py-3 text-muted-foreground tabular-nums">{r.unpaidLeaveDays}</td>
                <td className="px-4 py-3 text-muted-foreground tabular-nums">{r.sickLeaveDays}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </Card>
  );
}
