"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge, statusTone } from "@/components/ui/badge";
import { EditAttendanceModal } from "@/components/attendance/edit-attendance-modal";
import { formatClientTime } from "@/lib/time";

type Row = {
  employee: { id: string; name: string };
  assignment: { shiftType: { name: string } | null } | null;
  record: any;
  scheduled: boolean;
  presence: "WORKING" | "NOT_WORKING";
  exception: "MISSING_CHECK_IN" | "MISSING_CHECK_OUT" | null;
};

type Filter = "ALL" | "WORKING" | "MISSING_CHECK_IN" | "MISSING_CHECK_OUT";

function fmtTime(iso: string | Date | null) {
  if (!iso) return "—";
  return formatClientTime(new Date(iso));
}

export function AdminAttendanceOverview({ rows }: { rows: Row[] }) {
  const [filter, setFilter] = useState<Filter>("ALL");

  const counts = useMemo(
    () => ({
      working: rows.filter((r) => r.presence === "WORKING").length,
      missingCheckIn: rows.filter((r) => r.exception === "MISSING_CHECK_IN").length,
      missingCheckOut: rows.filter((r) => r.exception === "MISSING_CHECK_OUT").length,
    }),
    [rows]
  );

  const filtered = rows.filter((r) => {
    if (filter === "ALL") return true;
    if (filter === "WORKING") return r.presence === "WORKING";
    return r.exception === filter;
  });

  const tiles: { key: Filter; label: string; value: number; tone: "success" | "danger" }[] = [
    { key: "WORKING", label: "Working Now", value: counts.working, tone: "success" },
    { key: "MISSING_CHECK_IN", label: "Missing Check-In", value: counts.missingCheckIn, tone: "danger" },
    { key: "MISSING_CHECK_OUT", label: "Missing Check-Out", value: counts.missingCheckOut, tone: "danger" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter((prev) => (prev === t.key ? "ALL" : t.key))}
            className={`glass rounded-2xl p-4 text-left shadow-card transition ${
              filter === t.key ? "ring-2 ring-primary/50" : ""
            }`}
          >
            <span className="text-xs font-medium text-muted-foreground">{t.label}</span>
            <div className={`mt-2 text-2xl font-semibold tabular-nums ${t.tone === "danger" && t.value > 0 ? "text-danger" : ""}`}>
              {t.value}
            </div>
          </button>
        ))}
      </div>

      {filter !== "ALL" && (
        <button onClick={() => setFilter("ALL")} className="text-xs text-primary hover:underline">
          Clear filter — showing everyone
        </button>
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-2 font-medium">Employee</th>
              <th className="px-5 py-2 font-medium">Scheduled</th>
              <th className="px-5 py-2 font-medium">Presence</th>
              <th className="px-5 py-2 font-medium">Actual In</th>
              <th className="px-5 py-2 font-medium">Actual Out</th>
              <th className="px-5 py-2 font-medium">Exception</th>
              <th className="px-5 py-2 font-medium">Correct</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">
                  Nobody matches this filter.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.employee.id} className="border-b border-border/60 last:border-0 hover:bg-muted/20">
                  <td className="px-5 py-3 font-medium">{row.employee.name}</td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {row.scheduled ? row.assignment?.shiftType?.name ?? "Scheduled" : "Off today"}
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={statusTone(row.presence)}>{row.presence === "WORKING" ? "Working Now" : "Not Working"}</Badge>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground tabular-nums">{fmtTime(row.record?.actualCheckIn)}</td>
                  <td className="px-5 py-3 text-muted-foreground tabular-nums">{fmtTime(row.record?.actualCheckOut)}</td>
                  <td className="px-5 py-3">
                    {row.exception ? (
                      <Badge tone={statusTone(row.exception)}>{row.exception.replace(/_/g, " ")}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {row.record ? <EditAttendanceModal record={row.record} /> : <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
