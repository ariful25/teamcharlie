import Link from "next/link";
import { Card } from "@/components/ui/card";
import { formatMinutesAsHm } from "@/lib/time";

export function MonthlySummary({ rows }: { rows: any[] }) {
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="px-5 py-2 font-medium">Employee</th>
            <th className="px-5 py-2 font-medium">Days Worked</th>
            <th className="px-5 py-2 font-medium">Total Hours</th>
            <th className="px-5 py-2 font-medium">Average Daily</th>
            <th className="px-5 py-2 font-medium">Late Days</th>
            <th className="px-5 py-2 font-medium">Missing Check-outs</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                No attendance records for this month.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.employee.id} className="border-b border-border/60 last:border-0 hover:bg-muted/20">
                <td className="px-5 py-3">
                  <Link href={`/attendance/${r.employee.id}`} className="font-medium hover:underline">
                    {r.employee.name}
                  </Link>
                </td>
                <td className="px-5 py-3 text-muted-foreground tabular-nums">{r.daysWorked} Days</td>
                <td className="px-5 py-3 text-muted-foreground tabular-nums">{formatMinutesAsHm(r.totalMinutes)}</td>
                <td className="px-5 py-3 text-muted-foreground tabular-nums">{formatMinutesAsHm(r.avgDailyMinutes)} average</td>
                <td className="px-5 py-3 text-muted-foreground tabular-nums">{r.lateDays} Late Days</td>
                <td className="px-5 py-3 text-muted-foreground tabular-nums">{r.missingCheckouts} Missing Checkout</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </Card>
  );
}
