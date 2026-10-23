import Link from "next/link";
import type { PeriodRow } from "@/lib/queries/attendance";
import { hm } from "@/lib/attendance/format";

// Week / month hours with the buckets kept apart: approved regular, approved
// overtime, pending review and unapproved extra are never added together.
export function PeriodTable({ rows, emptyLabel = "No attendance in this period.", linkRows = true }: { rows: PeriodRow[]; emptyLabel?: string; linkRows?: boolean }) {
  if (rows.length === 0) return <p className="px-5 py-10 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left text-[11px] text-muted-foreground">
            <th className="px-5 py-2.5 font-medium">Employee</th>
            <th className="px-3 py-2.5 font-medium">Scheduled</th>
            <th className="px-3 py-2.5 font-medium text-primary">Paid regular</th>
            <th className="px-3 py-2.5 font-medium text-accent">Approved OT</th>
            <th className="px-3 py-2.5 font-medium text-warning">Pending</th>
            <th className="px-3 py-2.5 font-medium text-danger">Unapproved extra</th>
            <th className="px-3 py-2.5 font-medium">Days</th>
            <th className="px-3 py-2.5 font-medium">Late</th>
            <th className="px-3 py-2.5 font-medium">Missed punches</th>
            <th className="px-3 py-2.5 font-medium">Leave</th>
          </tr>
        </thead>
        <tbody className=" tabular-nums">
          {rows.map((r) => (
            <tr key={r.userId} className="border-b border-border/40 last:border-0 hover:bg-muted/10">
              <td className="px-5 py-3 font-sans font-medium">
                {linkRows ? (
                  <Link href={`/attendance/${r.userId}`} className="hover:text-primary">
                    {r.name}
                  </Link>
                ) : (
                  r.name
                )}
                {r.needsReview > 0 && <span className="ml-2 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] text-warning">{r.needsReview} to review</span>}
              </td>
              <td className="px-3 py-3 text-muted-foreground">{hm(r.scheduledMinutes)}</td>
              <td className="px-3 py-3 font-semibold text-primary">{hm(r.regularMinutes)}</td>
              <td className="px-3 py-3 text-accent">{hm(r.overtimeMinutes)}</td>
              <td className="px-3 py-3 text-warning">{r.pendingMinutes ? hm(r.pendingMinutes) : "—"}</td>
              <td className="px-3 py-3 text-danger">{r.extraMinutes ? hm(r.extraMinutes) : "—"}</td>
              <td className="px-3 py-3">{r.daysWorked}</td>
              <td className={`px-3 py-3 ${r.lateCount ? "text-warning" : "text-muted-foreground"}`}>{r.lateCount}</td>
              <td className={`px-3 py-3 ${r.missedPunches ? "text-danger" : "text-muted-foreground"}`}>{r.missedPunches}</td>
              <td className="px-3 py-3 text-muted-foreground">
                {r.paidLeaveDays + r.unpaidLeaveDays + r.sickLeaveDays > 0
                  ? `${r.paidLeaveDays}P · ${r.unpaidLeaveDays}U · ${r.sickLeaveDays}S`
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
