"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { WeekSelector } from "./week-selector";
import { ShiftGrid } from "./shift-grid";
import { AddEmployeeForm } from "./add-employee-form";
import { ShiftRingWrapper } from "./shift-ring-wrapper";
import { Button } from "@/components/ui/button";
import { formatClientLongDate, formatClientShortDate, formatClientWeekday } from "@/lib/time";
import type { DayCellAssignment } from "./day-cell";

type Roster = {
  weekStart: string;
  days: string[];
  shiftTypes: { id: string; name: string; startTime: string; endTime: string; colorHex: string }[];
  groupedByShift: {
    shiftType: { id: string; name: string; startTime: string; endTime: string; colorHex: string };
    rows: { userId: string; employeeName: string; shiftTypeId: string | null; days: DayCellAssignment[] }[];
  }[];
  unassignedRows: { userId: string; employeeName: string; shiftTypeId: string | null; days: DayCellAssignment[] }[];
  dailyWorkingCount: number[];
  allEmployees: { id: string; name: string }[];
  hasAnyAssignments: boolean;
};

export function ShiftScheduleBoard({
  initialRoster,
  canEdit,
}: {
  initialRoster: Roster;
  canEdit: boolean;
}) {
  const [roster, setRoster] = useState<Roster>(initialRoster);
  const [anchorDate, setAnchorDate] = useState(new Date(initialRoster.weekStart));
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchRoster = useCallback(async (date: Date) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/shift-schedule?date=${date.toISOString()}`);
      if (res.ok) {
        const data = await res.json();
        setRoster(data);
        setSelectedDayIndex(0);
      } else {
        toast.error("Could not load that week");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  function goToWeek(offsetDays: number) {
    const next = new Date(anchorDate.getTime() + offsetDays * 24 * 60 * 60 * 1000);
    setAnchorDate(next);
    fetchRoster(next);
  }

  function goToday() {
    const now = new Date();
    setAnchorDate(now);
    fetchRoster(now);
  }

  async function handleCopyPreviousWeek() {
    const res = await fetch("/api/shift-schedule/copy-previous-week", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekStart: roster.weekStart }),
    });
    if (res.ok) {
      const data = await res.json();
      toast.success(data.copied > 0 ? `Copied ${data.copied} day-assignments from last week` : "Last week had nothing to copy");
      fetchRoster(anchorDate);
    } else {
      toast.error("Could not copy last week");
    }
  }

  function updateCellInPlace(updated: NonNullable<DayCellAssignment>) {
    setRoster((prev) => {
      const dayIdx = prev.days.indexOf(updated.date);
      const patchRows = (rows: Roster["groupedByShift"][number]["rows"]) =>
        rows.map((r) => {
          if (r.userId !== updated.userId) return r;
          const days = [...r.days];
          if (dayIdx >= 0) days[dayIdx] = updated;
          return { ...r, days };
        });

      return {
        ...prev,
        groupedByShift: prev.groupedByShift.map((g) => ({ ...g, rows: patchRows(g.rows) })),
        unassignedRows: patchRows(prev.unassignedRows),
        dailyWorkingCount: prev.dailyWorkingCount.map((count, i) => {
          if (i !== dayIdx) return count;
          // Recompute this day's WORKING count from the patched state.
          const allRows = [...prev.groupedByShift.flatMap((g) => patchRows(g.rows)), ...patchRows(prev.unassignedRows)];
          return allRows.filter((r) => r.days[dayIdx]?.status === "WORKING").length;
        }),
      };
    });
    fetchRoster(anchorDate);
  }

  const weekLabel = (() => {
    const start = new Date(roster.weekStart);
    const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
    return `${formatClientShortDate(start)} – ${formatClientShortDate(end)}`;
  })();

  const selectedDate = new Date(roster.days[selectedDayIndex] ?? roster.weekStart);
  const dayLabel = formatClientWeekday(selectedDate);
  const dateLabel = formatClientLongDate(selectedDate);

  const chips = [
    ...roster.groupedByShift.flatMap((g) =>
      g.rows.map((r, i) => {
        const dayAssignment = r.days[selectedDayIndex];
        const shiftForDay = roster.shiftTypes.find((shift) => shift.id === dayAssignment?.shiftTypeId) ?? g.shiftType;
        return {
          userId: r.userId,
          name: r.employeeName,
          status: (dayAssignment?.status ?? "WORKING") as "WORKING" | "WEEKEND" | "LEAVE",
          angle:
            ((timeToFraction(shiftForDay.startTime) + timeToFraction(shiftForDay.endTime, true)) / 2) * Math.PI * 2 -
            Math.PI / 2 +
            (i - g.rows.length / 2) * 0.08,
        };
      })
    ),
    ...roster.unassignedRows.map((r, i) => {
      const dayAssignment = r.days[selectedDayIndex];
      return {
        userId: r.userId,
        name: r.employeeName,
        status: (dayAssignment?.status ?? "WORKING") as "WORKING" | "WEEKEND" | "LEAVE",
        angle: (i / Math.max(roster.unassignedRows.length, 1)) * Math.PI * 2 - Math.PI / 2,
        color: "#94a3b8",
      };
    }),
  ];

  function timeToFraction(hhmm: string, isEnd = false) {
    const [h, m] = hhmm.split(":").map(Number);
    let frac = (h * 60 + m) / (24 * 60);
    if (isEnd && frac === 0) frac = 1;
    return frac;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <WeekSelector label={weekLabel} onPrev={() => goToWeek(-7)} onNext={() => goToWeek(7)} onToday={goToday} />
        {canEdit && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handleCopyPreviousWeek}>
              <Copy className="h-3.5 w-3.5" /> Copy Last Week
            </Button>
            <AddEmployeeForm
              employees={roster.allEmployees}
              shiftTypes={roster.shiftTypes}
              weekStart={roster.weekStart}
              onAdded={() => fetchRoster(anchorDate)}
            />
          </div>
        )}
      </div>

      <ShiftRingWrapper
        shifts={roster.shiftTypes}
        chips={chips}
        dayLabel={dayLabel}
        dateLabel={dateLabel}
        onPrevDay={() => setSelectedDayIndex((i) => (i - 1 + 7) % 7)}
        onNextDay={() => setSelectedDayIndex((i) => (i + 1) % 7)}
      />

      {!roster.hasAnyAssignments ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">No shift schedule created for this week yet.</p>
          {canEdit && (
            <Button variant="secondary" size="sm" className="mt-3" onClick={handleCopyPreviousWeek}>
              <Copy className="h-3.5 w-3.5" /> Copy Last Week
            </Button>
          )}
        </div>
      ) : (
        <ShiftGrid
          days={roster.days}
          shiftTypes={roster.shiftTypes}
          groupedByShift={roster.groupedByShift}
          unassignedRows={roster.unassignedRows}
          dailyWorkingCount={roster.dailyWorkingCount}
          canEdit={canEdit}
          onCellSaved={updateCellInPlace}
        />
      )}

      {loading && <p className="text-center text-xs text-muted-foreground">Loading…</p>}
    </div>
  );
}
