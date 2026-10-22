"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlusCircle, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
import { useTeamTimezone } from "@/components/providers/team-timezone";
import type { OvertimeView, RecordView } from "@/lib/queries/attendance";
import { ClaimDialog } from "./claim-dialog";
import { OvertimeDialog } from "./overtime-dialog";
import { Chip, DayBadge, Panel, ShiftTimeline, StateChip, hm, scheduleLabel, timeIn } from "./ui";

type Option = { id: string; name: string };

const FIXABLE = new Set(["MISSED_SHIFT", "LATE_NOT_IN", "DONE", "NEEDS_REVIEW", "AUTO_STOPPED"]);

/** The signed-in person's own shifts and overtime requests. */
export function MyAttendance({ shifts, overtime, leads, today }: { shifts: RecordView[]; overtime: OvertimeView[]; leads: Option[]; today: string }) {
  const tz = useTeamTimezone();
  const router = useRouter();
  const [claimDay, setClaimDay] = useState<string | null>(null);
  const [overtimeOpen, setOvertimeOpen] = useState(false);

  async function cancel(id: string) {
    const res = await fetch(`/api/overtime/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Request cancelled");
      router.refresh();
    } else toast.error("Could not cancel");
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
      <Panel
        title="My recent shifts"
        action={
          <Button size="sm" variant="secondary" onClick={() => setClaimDay(today)}>
            <Wrench className="h-3.5 w-3.5" /> Fix a missed punch
          </Button>
        }
      >
        {shifts.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">No shifts in the last two weeks.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {shifts.map((v) => (
              <li key={v.date} className="grid gap-2 px-5 py-3 sm:grid-cols-[140px_1fr_auto] sm:items-center">
                <div>
                  <DayBadge dayKey={v.date} today={today} />
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">{scheduleLabel(v)}</p>
                </div>
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <StateChip state={v.state} />
                    {v.lateMinutes > 0 && <Chip tone="warning">Late {hm(v.lateMinutes)}</Chip>}
                    {v.review === "APPROVED" && <Chip tone="success">Confirmed{v.reviewedByName ? ` by ${v.reviewedByName}` : ""}</Chip>}
                    {v.review === "REJECTED" && <Chip tone="danger">Not accepted{v.reviewNote ? ` — ${v.reviewNote}` : ""}</Chip>}
                  </div>
                  <ShiftTimeline v={v} compact />
                  <p className="flex flex-wrap gap-x-3 font-mono text-[11px] text-muted-foreground">
                    <span>In {timeIn(v.effectiveCheckIn ?? v.actualCheckIn, tz)}</span>
                    <span>Out {timeIn(v.effectiveCheckOut ?? v.actualCheckOut ?? v.reportedCheckOutAt, tz)}</span>
                    <span className={v.credit.bucket === "pending" ? "text-warning" : "text-foreground"}>
                      {v.credit.bucket === "pending" ? "Pending" : "Paid"} {hm(v.credit.regularMinutes + v.credit.overtimeMinutes)}
                    </span>
                    {v.credit.extraMinutes > 0 && <span className="text-danger">+{hm(v.credit.extraMinutes)} not approved</span>}
                  </p>
                </div>
                <div className="flex justify-end">
                  {FIXABLE.has(v.state) && v.review !== "APPROVED" && (
                    <Button size="sm" variant="outline" onClick={() => setClaimDay(v.date)}>
                      Fix
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="My overtime"
        action={
          <Button size="sm" variant="secondary" onClick={() => setOvertimeOpen(true)}>
            <PlusCircle className="h-3.5 w-3.5" /> Request
          </Button>
        }
      >
        <p className="border-b border-border/60 px-5 py-3 text-[11px] text-muted-foreground">
          Ask before staying late. Only approved overtime is paid — extra time without approval isn&apos;t counted as overtime.
        </p>
        {overtime.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">No overtime requests yet.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {overtime.map((o) => (
              <li key={o.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <DayBadge dayKey={o.date} today={today} />
                    <Chip tone={o.status === "APPROVED" ? "accent" : o.status === "PENDING" ? "info" : "muted"} pulse={o.status === "PENDING"}>
                      {o.status === "APPROVED"
                        ? `Approved ${hm(o.approvedMinutes ?? o.requestedMinutes)}`
                        : o.status === "PENDING"
                          ? `Waiting · ${hm(o.requestedMinutes)}`
                          : o.status.toLowerCase()}
                    </Chip>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{o.reason}</p>
                  {o.reviewNote && <p className="text-[11px] text-muted-foreground">“{o.reviewNote}”</p>}
                </div>
                {o.status === "PENDING" && (
                  <IconTooltip label="Cancel request">
                    <button onClick={() => cancel(o.id)} aria-label="Cancel overtime request" className="rounded-lg p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger">
                      <X className="h-4 w-4" />
                    </button>
                  </IconTooltip>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {claimDay && <ClaimDialog key={claimDay} open onOpenChange={(o) => !o && setClaimDay(null)} defaultDate={claimDay} />}
      <OvertimeDialog open={overtimeOpen} onOpenChange={setOvertimeOpen} leads={leads} />
    </div>
  );
}
