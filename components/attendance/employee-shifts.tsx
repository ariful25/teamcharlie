"use client";

import { useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTeamTimezone } from "@/components/providers/team-timezone";
import type { RecordView } from "@/lib/queries/attendance";
import { ReviewDialog, type ReviewTarget } from "./review-dialog";
import { Chip, DayBadge, Panel, ShiftTimeline, StateChip, TimelineLegend, hm, scheduleLabel, timeIn } from "./ui";

/** One employee's shift history; leads can open any shift to review/correct. */
export function EmployeeShifts({
  shifts,
  today,
  canReview,
  currentUser,
}: {
  shifts: RecordView[];
  today: string;
  canReview: boolean;
  currentUser: { id: string; role: string };
}) {
  const tz = useTeamTimezone();
  const [target, setTarget] = useState<ReviewTarget | null>(null);

  return (
    <Panel title="Shifts — last 45 days" action={<TimelineLegend />}>
      {shifts.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">No shifts in this period.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {shifts.map((v) => (
            <li key={v.date} className="grid gap-2 px-5 py-3 md:grid-cols-[150px_1fr_auto] md:items-center">
              <div>
                <DayBadge dayKey={v.date} today={today} />
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">{scheduleLabel(v)}</p>
              </div>
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <StateChip state={v.state} />
                  {v.lateMinutes > 0 && <Chip tone="warning">Late {hm(v.lateMinutes)}</Chip>}
                  {v.missedCheckIn && <Chip tone="warning">Missed check-in</Chip>}
                  {v.missedCheckOut && <Chip tone="danger">Missed check-out</Chip>}
                  {v.review === "APPROVED" && <Chip tone="success">Confirmed{v.reviewedByName ? ` by ${v.reviewedByName}` : ""}</Chip>}
                </div>
                <ShiftTimeline v={v} compact />
                <p className="flex flex-wrap gap-x-3 font-mono text-[11px] text-muted-foreground">
                  <span>In {timeIn(v.effectiveCheckIn ?? v.actualCheckIn, tz)}</span>
                  <span>Out {timeIn(v.effectiveCheckOut ?? v.actualCheckOut ?? v.reportedCheckOutAt, tz)}</span>
                  <span className={v.credit.bucket === "pending" ? "text-warning" : "text-foreground"}>
                    {v.credit.bucket === "pending" ? "Pending" : "Paid"} {hm(v.credit.regularMinutes)}
                  </span>
                  {v.credit.overtimeMinutes > 0 && <span className="text-accent">OT {hm(v.credit.overtimeMinutes)}</span>}
                  {v.credit.extraMinutes > 0 && <span className="text-danger">+{hm(v.credit.extraMinutes)} unapproved</span>}
                </p>
              </div>
              <div className="flex justify-end">
                {canReview && v.state !== "WORKING" && (
                  <Button size="sm" variant={v.review === "PENDING" || v.state === "MISSED_SHIFT" ? "primary" : "outline"} onClick={() => setTarget({ recordId: v.id, userId: v.userId, date: v.date })}>
                    <ClipboardCheck className="h-3.5 w-3.5" /> {v.review === "PENDING" || v.state === "MISSED_SHIFT" ? "Review" : "Correct"}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <ReviewDialog target={target} open={!!target} onOpenChange={(o) => !o && setTarget(null)} currentUserId={currentUser.id} currentUserRole={currentUser.role} />
    </Panel>
  );
}
