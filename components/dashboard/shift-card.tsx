"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AlarmClock, Hourglass, LogIn, LogOut, Lock, PlusCircle, Send, Timer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatClientTime } from "@/lib/time";
import { CheckoutChecklistDialog } from "@/components/dashboard/checkout-checklist-dialog";
import { useTeamTimezone } from "@/components/providers/team-timezone";
import { ClaimDialog } from "@/components/attendance/claim-dialog";
import { OvertimeDialog } from "@/components/attendance/overtime-dialog";
import { Chip, StateChip, dayLabel, hm, timeIn } from "@/components/attendance/ui";
import type { ShiftCardState } from "@/lib/queries/attendance";

type ChecklistItem = { id: string; label: string };
type Option = { id: string; name: string };

function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// The employee's own shift control. Every state the attendance rules can put
// someone in has its own clear screen — see docs/attendance-rules.md.
export function ShiftCard({ state, checklistItems = [], leads = [] }: { state: ShiftCardState; checklistItems?: ChecklistItem[]; leads?: Option[] }) {
  const tz = useTeamTimezone();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [now, setNow] = useState<number | null>(null);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [overtimeOpen, setOvertimeOpen] = useState(false);
  const refreshedAtStop = useRef(false);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // When a running timer reaches its auto-stop, refresh once so the server
  // records the stop and the card switches to the "auto-stopped" screen.
  useEffect(() => {
    if (state.kind !== "working" || now === null || refreshedAtStop.current) return;
    if (now >= new Date(state.autoStopAt).getTime()) {
      refreshedAtStop.current = true;
      router.refresh();
    }
  }, [now, state, router]);

  function post(url: string, body: unknown, success: string) {
    startTransition(async () => {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Something went wrong");
        router.refresh();
        return;
      }
      setChecklistOpen(false);
      toast.success(success);
      router.refresh();
    });
  }

  function startCheckOut() {
    if (checklistItems.length > 0) setChecklistOpen(true);
    else post("/api/attendance/checkout", { checklist: [] }, state.kind === "auto_stopped" ? "Check-out confirmed — sent for review" : "Shift completed");
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass glow-border relative overflow-hidden rounded-2xl p-6">
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Your shift</p>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{now === null ? "—" : formatClientTime(new Date(now), tz)}</span>
      </div>

      {state.kind === "ready" && (
        <>
          {state.next ? (
            <div className="mt-3">
              <p className="text-[11px] text-muted-foreground">
                {dayLabel(state.next.date, "EEEE, d MMM")}
                {state.next.shiftName ? ` · ${state.next.shiftName}` : ""}
              </p>
              <p className="font-mono text-2xl font-semibold tabular-nums">
                {state.next.start} <span className="text-muted-foreground">→</span> {state.next.end}
              </p>
              {now !== null && now > new Date(state.next.startAt).getTime() && (
                <Chip tone="warning" pulse className="mt-2">
                  Late by {hm((now - new Date(state.next.startAt).getTime()) / 60000)}
                </Chip>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No shift scheduled right now — checking in records an unscheduled shift.</p>
          )}
          <Button onClick={() => post("/api/attendance/checkin", {}, "Checked in")} disabled={isPending} className="mt-5 w-full" size="lg">
            <LogIn className="h-4 w-4" /> Check In
          </Button>
          <button onClick={() => setClaimOpen(true)} className="mt-2 w-full text-center text-[11px] text-muted-foreground hover:text-primary">
            Forgot to punch on an earlier shift?
          </button>
        </>
      )}

      {state.kind === "working" && (
        <>
          {(() => {
            const start = new Date(state.shift.actualCheckIn!).getTime();
            const stop = new Date(state.autoStopAt).getTime();
            const elapsed = now === null ? 0 : Math.min(now, stop) - start;
            const shiftLen = state.shift.shiftStartAt && state.shift.shiftEndAt ? new Date(state.shift.shiftEndAt).getTime() - start : null;
            const progress = shiftLen && shiftLen > 0 ? Math.min(100, (elapsed / shiftLen) * 100) : null;
            return (
              <div className="mt-3 space-y-3">
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <StateChip state="WORKING" />
                    <p className="mt-2 flex items-center gap-2 font-mono text-3xl font-semibold tabular-nums tracking-tight">
                      <Timer className="h-5 w-5 text-primary" /> {clock(elapsed)}
                    </p>
                  </div>
                  <div className="text-right text-[11px] text-muted-foreground">
                    <p>In at {timeIn(state.shift.actualCheckIn, tz)}</p>
                    <p>{dayLabel(state.shift.date)}</p>
                  </div>
                </div>
                {progress !== null && (
                  <div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted/40">
                      <div className="h-full rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary))]" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                      <span>Shift ends {timeIn(state.shift.shiftEndAt, tz)}</span>
                      {state.shift.overtimeApprovedMinutes > 0 && <span className="text-accent">+{hm(state.shift.overtimeApprovedMinutes)} overtime approved</span>}
                    </p>
                  </div>
                )}
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <AlarmClock className="h-3 w-3" /> Forget to check out? The timer stops at {timeIn(state.autoStopAt, tz)} and goes to your team lead.
                </p>
              </div>
            );
          })()}
          <Button onClick={startCheckOut} disabled={isPending} variant="danger" className="mt-4 w-full" size="lg">
            <LogOut className="h-4 w-4" /> Check Out
          </Button>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={() => setOvertimeOpen(true)}>
              <PlusCircle className="h-3.5 w-3.5" /> Overtime
            </Button>
            <Button variant="outline" size="sm" onClick={() => setClaimOpen(true)}>
              <Hourglass className="h-3.5 w-3.5" /> Started earlier
            </Button>
          </div>
        </>
      )}

      {state.kind === "auto_stopped" && (
        <div className="mt-3 space-y-3">
          <StateChip state="AUTO_STOPPED" />
          <p className="font-mono text-3xl font-semibold tabular-nums tracking-tight text-danger">
            {clock(new Date(state.shift.autoClosedAt!).getTime() - new Date(state.shift.actualCheckIn!).getTime())}
          </p>
          <p className="text-xs text-muted-foreground">
            You checked in at {timeIn(state.shift.actualCheckIn, tz)} on {dayLabel(state.shift.date)} and didn&apos;t check out, so the timer
            stopped. Your hours count as the scheduled time ({hm(state.shift.credit.regularMinutes)}) once your team lead confirms them.
          </p>
          <Button onClick={startCheckOut} disabled={isPending} variant="danger" className="w-full" size="lg">
            <LogOut className="h-4 w-4" /> Confirm check-out
          </Button>
        </div>
      )}

      {state.kind === "blocked" && (
        <div className="mt-3 space-y-3">
          {state.request && state.request.id === state.blocking.id ? (
            <>
              <Chip tone="info" pulse>
                Waiting for approval
              </Chip>
              <p className="text-xs text-muted-foreground">
                You asked to check in at <span className="font-mono text-foreground">{timeIn(state.request.checkInRequestedAt, tz)}</span>. A team lead
                will confirm it — you&apos;ll be able to check out once they do.
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-danger" />
                <p className="text-sm font-medium">Check-in locked</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Your shift on <span className="text-foreground">{dayLabel(state.blocking.date, "EEEE, d MMM")}</span> has no check-out. A team lead has
                to confirm its times before you can check in again.
              </p>
              {state.request ? (
                <Chip tone="info" pulse>
                  Check-in requested at {timeIn(state.request.checkInRequestedAt, tz)}
                </Chip>
              ) : (
                <Button onClick={() => post("/api/attendance/request-checkin", {}, "Request sent — your start time is recorded")} disabled={isPending} className="w-full" size="lg">
                  <Send className="h-4 w-4" /> Request check-in
                </Button>
              )}
              <p className="text-[11px] text-muted-foreground">Requesting records the time now, so your real start isn&apos;t lost.</p>
            </>
          )}
        </div>
      )}

      {state.kind === "done" && (
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <StateChip state={state.shift.state} />
            <span className="text-[11px] text-muted-foreground">{dayLabel(state.shift.date)}</span>
          </div>
          <Row label="Check-in" value={timeIn(state.shift.effectiveCheckIn ?? state.shift.actualCheckIn, tz)} />
          <Row label="Check-out" value={timeIn(state.shift.effectiveCheckOut ?? state.shift.actualCheckOut ?? state.shift.reportedCheckOutAt, tz)} />
          <Row label={state.shift.credit.bucket === "pending" ? "Hours (pending)" : "Hours"} value={hm(state.shift.credit.regularMinutes + state.shift.credit.overtimeMinutes)} strong />
          {state.next && (
            <p className="pt-1 text-[11px] text-muted-foreground">
              Next: {dayLabel(state.next.date)} · {state.next.start} → {state.next.end}
            </p>
          )}
        </div>
      )}

      <CheckoutChecklistDialog
        open={checklistOpen}
        onOpenChange={setChecklistOpen}
        items={checklistItems}
        onConfirm={(checklist) =>
          post("/api/attendance/checkout", { checklist }, state.kind === "auto_stopped" ? "Check-out confirmed — sent for review" : "Shift completed")
        }
        submitting={isPending}
      />
      <ClaimDialog
        open={claimOpen}
        onOpenChange={setClaimOpen}
        mode={state.kind === "working" ? "start" : "both"}
        defaultDate={state.kind === "working" ? state.shift.date : undefined}
      />
      <OvertimeDialog
        open={overtimeOpen}
        onOpenChange={setOvertimeOpen}
        leads={leads}
        defaultDate={state.kind === "working" ? state.shift.date : undefined}
      />
    </motion.div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "font-medium" : "text-muted-foreground"}`}>
      <span>{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}
