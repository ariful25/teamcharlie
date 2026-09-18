"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, statusTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CheckCircle2, XCircle, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { formatClientTime, formatMinutesAsHm } from "@/lib/time";

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return formatClientTime(new Date(iso));
}

export function AttendanceTable({ rows, canEdit }: { rows: any[]; canEdit: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function retry(recordId: string, kind: "checkin" | "checkout") {
    startTransition(async () => {
      const res = await fetch("/api/attendance/retry-discord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId, kind }),
      });
      if (res.ok) {
        toast.success("Discord sync retried");
        router.refresh();
      } else {
        toast.error("Retry failed");
      }
    });
  }

  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="px-5 py-2 font-medium">Employee</th>
            <th className="px-5 py-2 font-medium">Scheduled In</th>
            <th className="px-5 py-2 font-medium">Actual In</th>
            <th className="px-5 py-2 font-medium">Scheduled Out</th>
            <th className="px-5 py-2 font-medium">Actual Out</th>
            <th className="px-5 py-2 font-medium">Hours Worked</th>
            <th className="px-5 py-2 font-medium">Status</th>
            <th className="px-5 py-2 font-medium">Discord</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ employee, record }) => (
            <tr key={employee.id} className="border-b border-border/60 last:border-0 hover:bg-muted/20">
              <td className="px-5 py-3">
                <Link href={`/attendance/${employee.id}`} className="font-medium hover:underline">
                  {employee.name}
                </Link>
              </td>
              <td className="px-5 py-3 text-muted-foreground tabular-nums">{record?.scheduledCheckIn ?? "—"}</td>
              <td className="px-5 py-3 text-muted-foreground tabular-nums">{fmtTime(record?.actualCheckIn ?? null)}</td>
              <td className="px-5 py-3 text-muted-foreground tabular-nums">{record?.scheduledCheckOut ?? "—"}</td>
              <td className="px-5 py-3 text-muted-foreground tabular-nums">{fmtTime(record?.actualCheckOut ?? null)}</td>
              <td className="px-5 py-3 text-muted-foreground tabular-nums">
                {record?.totalMinutes != null ? formatMinutesAsHm(record.totalMinutes) : "—"}
              </td>
              <td className="px-5 py-3">
                <Badge tone={statusTone(record?.status ?? "MISSING_CHECK_IN")}>
                  {(record?.status ?? "MISSING_CHECK_IN").replace(/_/g, " ")}
                </Badge>
              </td>
              <td className="px-5 py-3">
                {!record ? (
                  "—"
                ) : (
                  <div className="flex items-center gap-2 text-xs">
                    {record.actualCheckIn && (
                      <span className="flex items-center gap-1">
                        {record.discordCheckInSynced ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                        ) : (
                          <button
                            disabled={isPending}
                            onClick={() => retry(record.id, "checkin")}
                            className="flex items-center gap-1 text-warning hover:underline"
                          >
                            <XCircle className="h-3.5 w-3.5" /> Retry <RefreshCcw className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
