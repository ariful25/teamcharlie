"use client";

import { useEffect, useRef } from "react";
import anime from "animejs";
import { DayCell, type DayCellAssignment } from "./day-cell";
import { formatClientShortDate } from "@/lib/time";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function ShiftGrid({
  days,
  groupedByShift,
  unassignedRows,
  dailyWorkingCount,
  shiftTypes,
  canEdit,
  onCellSaved,
}: {
  days: string[]; // 7 ISO dates, Mon..Sun
  shiftTypes: { id: string; name: string; colorHex: string }[];
  groupedByShift: {
    shiftType: { id: string; name: string; startTime: string; endTime: string; colorHex: string };
    rows: { userId: string; employeeName: string; shiftTypeId: string | null; days: DayCellAssignment[] }[];
  }[];
  unassignedRows: { userId: string; employeeName: string; shiftTypeId: string | null; days: DayCellAssignment[] }[];
  dailyWorkingCount: number[];
  canEdit: boolean;
  onCellSaved: (assignment: NonNullable<DayCellAssignment>) => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const hasRemovedShiftAssignments = unassignedRows.some((row) => row.days.some((day) => day?.shiftTypeId));

  // anime.js staggered reveal whenever the week's data changes (switching weeks),
  // rather than an instant re-render — mirrors the staggering demos on animejs.com.
  useEffect(() => {
    if (!gridRef.current) return;
    const cells = gridRef.current.querySelectorAll("[data-shift-cell]");
    anime({
      targets: cells,
      opacity: [0, 1],
      translateY: [8, 0],
      easing: "easeOutCubic",
      duration: 320,
      delay: anime.stagger(18, { grid: [7, cells.length / 7 || 1], from: "first" }),
    });
  }, [days, groupedByShift, unassignedRows]);

  const dayHeader = (
    <div className="grid grid-cols-[180px_120px_repeat(7,1fr)] gap-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      <div>Player</div>
      <div>Note</div>
      {days.map((d, i) => (
        <div key={d} className="text-center">
          {DAY_LABELS[i]}
          <div className="text-[10px] font-normal normal-case text-muted-foreground/70">
            {formatClientShortDate(new Date(d))}
          </div>
        </div>
      ))}
    </div>
  );

  const allRows = [...groupedByShift.flatMap((g) => g.rows.map((r) => ({ ...r, shiftName: g.shiftType.name, color: g.shiftType.colorHex }))), ...unassignedRows.map((r) => ({ ...r, shiftName: "Unassigned", color: "#64748b" }))];

  if (allRows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        No shift schedule created for this week yet.
      </div>
    );
  }

  return (
    <div ref={gridRef} className="space-y-6 overflow-x-auto pb-2">
      {dayHeader}

      {groupedByShift
        .filter((g) => g.rows.length > 0)
        .map((group) => (
          <div key={group.shiftType.id} className="min-w-[900px] space-y-1.5">
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={{ backgroundColor: `${group.shiftType.colorHex}22`, color: group.shiftType.colorHex }}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: group.shiftType.colorHex }} />
              {group.shiftType.name} Staff — {group.rows.length}
              <span className="ml-auto font-normal text-muted-foreground">
                {group.shiftType.startTime}–{group.shiftType.endTime}
              </span>
            </div>
            {group.rows.map((row) => (
              <div key={row.userId} className="grid grid-cols-[180px_120px_repeat(7,1fr)] items-center gap-2 px-2">
                <div className="truncate text-sm font-medium">{row.employeeName}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {row.days.find((d) => d?.note)?.note ?? `${group.shiftType.startTime}–${group.shiftType.endTime}`}
                </div>
                {row.days.map((assignment, i) => (
                  <div key={days[i]} data-shift-cell>
                    <DayCell
                      assignment={assignment}
                      userId={row.userId}
                      date={days[i]}
                      defaultShiftTypeId={group.shiftType.id}
                      shiftTypes={shiftTypes}
                      canEdit={canEdit}
                      onSaved={onCellSaved}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}

      {unassignedRows.length > 0 && (
        <div className="min-w-[900px] space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-muted/40 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
            <span>Unassigned Shift — {unassignedRows.length}</span>
            {hasRemovedShiftAssignments && (
              <span className="font-normal text-muted-foreground/75">
                These assignments reference a shift type that's been removed.
              </span>
            )}
          </div>
          {unassignedRows.map((row) => (
            <div key={row.userId} className="grid grid-cols-[180px_120px_repeat(7,1fr)] items-center gap-2 px-2">
              <div className="truncate text-sm font-medium">{row.employeeName}</div>
              <div className="truncate text-xs text-muted-foreground">—</div>
              {row.days.map((assignment, i) => (
                <div key={days[i]} data-shift-cell>
                  <DayCell
                    assignment={assignment}
                    userId={row.userId}
                    date={days[i]}
                    defaultShiftTypeId={null}
                    shiftTypes={shiftTypes}
                    canEdit={canEdit}
                    onSaved={onCellSaved}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="min-w-[900px] grid grid-cols-[180px_120px_repeat(7,1fr)] gap-2 border-t border-border px-2 pt-3 text-sm font-semibold">
        <div className="col-span-2">Daily Staff Count</div>
        {dailyWorkingCount.map((count, i) => (
          <div key={days[i]} className="text-center text-primary tabular-nums">
            {count}
          </div>
        ))}
      </div>
    </div>
  );
}
