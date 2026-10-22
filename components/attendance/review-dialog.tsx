"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Circle, History, Loader2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/shared/form-field";
import { useTeamTimezone } from "@/components/providers/team-timezone";
import { formatClientDateTime, fromLocalInputValue, toLocalInputValue } from "@/lib/time";
import { splitWorked } from "@/lib/attendance/rules";
import type { RecordView } from "@/lib/queries/attendance";
import { Chip, ShiftTimeline, StateChip, TimelineLegend, dayLabel, hm, scheduleLabel, timeIn } from "./ui";

export type ReviewTarget = { recordId: string | null; userId: string; date: string };

type Context = {
  shift: RecordView;
  tasks: { id: string; title: string; status: string; dueTime: string | null }[];
  overtime: { id: string; status: string; requestedMinutes: number; approvedMinutes: number | null; reason: string }[];
  audits: { id: string; action: string; actorName: string; note: string | null; createdAt: string }[];
};

function defaultTimes(v: RecordView) {
  const start = v.effectiveCheckIn ?? v.claimedCheckIn ?? v.actualCheckIn ?? v.checkInRequestedAt ?? v.shiftStartAt;
  let end = v.effectiveCheckOut ?? v.claimedCheckOut ?? v.actualCheckOut ?? null;
  if (!end) {
    // Forgotten check-out: scheduled end by default (team rule — scheduled
    // time only), or the moment they pressed check-out if that was earlier.
    const candidates = [v.reportedCheckOutAt, v.shiftEndAt ?? v.autoClosedAt].filter(Boolean) as string[];
    end = candidates.sort()[0] ?? null;
  }
  return { start, end };
}

const ACTION_LABEL: Record<string, string> = {
  AUTO_STOP: "Timer auto-stopped",
  CONFIRM_CHECKOUT: "Employee confirmed check-out",
  REQUEST_CHECK_IN: "Employee requested check-in",
  CLAIM: "Employee submitted a correction",
  APPROVE: "Approved",
  CORRECT: "Corrected after approval",
  REJECT: "Rejected",
  APPROVE_CHECK_IN: "Check-in approved",
};

export function ReviewDialog({
  target,
  open,
  onOpenChange,
  currentUserId,
  currentUserRole,
}: {
  target: ReviewTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId: string;
  currentUserRole: string;
}) {
  const tz = useTeamTimezone();
  const router = useRouter();
  const [ctx, setCtx] = useState<Context | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [tasksConfirmed, setTasksConfirmed] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !target) return;
    let cancelled = false;
    setLoading(true);
    setCtx(null);
    const qs = target.recordId ? `recordId=${target.recordId}` : `userId=${target.userId}&date=${target.date}`;
    fetch(`/api/attendance/review-context?${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: Context) => {
        if (cancelled) return;
        setCtx(data);
        const d = defaultTimes(data.shift);
        setCheckIn(d.start ? toLocalInputValue(new Date(d.start), tz) : "");
        setCheckOut(d.end ? toLocalInputValue(new Date(d.end), tz) : "");
        setTasksConfirmed(false);
        setNote("");
      })
      .catch(() => !cancelled && toast.error("Could not load this shift"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, target, tz]);

  const v = ctx?.shift ?? null;
  const isSelf = v?.userId === currentUserId;
  const blockedSelf = isSelf && currentUserRole !== "ADMIN";
  const openTasks = ctx?.tasks.filter((t) => t.status !== "COMPLETED") ?? [];
  const checkInRequestOnly = !!v && v.state === "REQUESTED_CHECK_IN" && !!v.shiftEndAt && new Date(v.shiftEndAt).getTime() > Date.now();
  const noPunches = !!v && !v.actualCheckIn && !v.checkInRequestedAt;

  const preview = useMemo(() => {
    if (!v) return null;
    const a = fromLocalInputValue(checkIn, tz);
    const b = fromLocalInputValue(checkOut, tz);
    if (!a || !b || b.getTime() <= a.getTime()) return null;
    return splitWorked(a, b, v.shiftStartAt ? new Date(v.shiftStartAt) : null, v.shiftEndAt ? new Date(v.shiftEndAt) : null, v.overtimeApprovedMinutes);
  }, [checkIn, checkOut, tz, v]);

  async function submit(action: "APPROVE" | "REJECT" | "APPROVE_CHECK_IN") {
    if (!v) return;
    const a = fromLocalInputValue(checkIn, tz);
    const b = fromLocalInputValue(checkOut, tz);
    setBusy(action);
    const res = await fetch("/api/attendance/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recordId: v.id ?? undefined,
        userId: v.id ? undefined : v.userId,
        date: v.id ? undefined : v.date,
        action,
        checkIn: action === "APPROVE" ? a?.toISOString() ?? null : null,
        checkOut: action === "APPROVE" ? b?.toISOString() ?? null : null,
        tasksConfirmed,
        note: note.trim() || null,
      }),
    });
    setBusy(null);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Could not save");
      return;
    }
    toast.success(action === "REJECT" ? (noPunches ? "Marked absent" : "Rejected") : action === "APPROVE_CHECK_IN" ? "Check-in approved" : "Shift approved");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={v ? `Review · ${v.userName}` : "Review shift"} className="max-w-2xl">
        {loading || !v ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading shift…
          </div>
        ) : (
          <div className="max-h-[75vh] space-y-5 overflow-y-auto pr-1 text-sm">
            {/* Which day — stated first and big, so nobody fixes the wrong one. */}
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Shift of</p>
              <p className="font-display text-xl font-semibold">{dayLabel(v.date, "EEEE, d MMMM yyyy")}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">{v.shiftName ? `${v.shiftName} · ` : ""}{scheduleLabel(v)}</span>
                <StateChip state={v.state} />
                {v.lateMinutes > 0 && <Chip tone="warning">Late {v.lateMinutes}m</Chip>}
                {v.missedCheckIn && <Chip tone="warning">Missed check-in</Chip>}
                {v.missedCheckOut && <Chip tone="danger">Missed check-out</Chip>}
              </div>
            </div>

            <div className="space-y-2">
              <ShiftTimeline v={v} />
              <TimelineLegend />
            </div>

            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Fact label="Checked in" value={timeIn(v.actualCheckIn, tz)} />
              <Fact label="Checked out" value={timeIn(v.actualCheckOut, tz)} />
              {v.autoClosedAt && <Fact label="Auto-stopped at" value={formatClientDateTime(new Date(v.autoClosedAt), tz)} tone="danger" />}
              {v.reportedCheckOutAt && <Fact label="Pressed check-out" value={formatClientDateTime(new Date(v.reportedCheckOutAt), tz)} />}
              {v.checkInRequestedAt && <Fact label="Requested check-in" value={formatClientDateTime(new Date(v.checkInRequestedAt), tz)} tone="info" />}
              {v.claimedCheckIn && <Fact label="Claims started" value={formatClientDateTime(new Date(v.claimedCheckIn), tz)} tone="warning" />}
              {v.claimedCheckOut && <Fact label="Claims finished" value={formatClientDateTime(new Date(v.claimedCheckOut), tz)} tone="warning" />}
              {v.overtimeApprovedMinutes > 0 && <Fact label="Approved overtime" value={hm(v.overtimeApprovedMinutes)} tone="accent" />}
              {v.overtimePendingMinutes > 0 && <Fact label="Overtime requested" value={`${hm(v.overtimePendingMinutes)} (pending)`} />}
            </dl>
            {v.claimReason && (
              <p className="rounded-xl border border-border bg-muted/20 px-3 py-2 text-xs">
                <span className="font-medium">Employee&apos;s note: </span>
                {v.claimReason}
              </p>
            )}
            {v.review === "APPROVED" && (
              <p className="rounded-xl border border-success/30 bg-success/5 px-3 py-2 text-xs text-success">
                Already approved{v.reviewedByName ? ` by ${v.reviewedByName}` : ""}. Saving again records a correction in the audit trail.
              </p>
            )}

            {blockedSelf ? (
              <p className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-3 text-xs text-warning">
                This is your own shift. Another team lead or an admin has to review it.
              </p>
            ) : checkInRequestOnly ? (
              <div className="space-y-3 rounded-2xl border border-info/30 bg-info/5 p-4">
                <p>
                  {v.userName} asked to start this shift at{" "}
                  <span className="font-mono font-semibold">{timeIn(v.checkInRequestedAt, tz)}</span> but was blocked by an earlier shift with no
                  check-out. Approving records that time as their check-in (resolve the earlier shift first).
                </p>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={inputClass} placeholder="Note (required to reject)" />
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="outline" disabled={!!busy} onClick={() => submit("REJECT")}>
                    Reject request
                  </Button>
                  <Button disabled={!!busy} onClick={() => submit("APPROVE_CHECK_IN")}>
                    {busy === "APPROVE_CHECK_IN" ? "Saving…" : `Approve check-in at ${timeIn(v.checkInRequestedAt, tz)}`}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 rounded-2xl border border-border bg-muted/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Confirm the real times (both required)</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Check-in</span>
                    <input type="datetime-local" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className={inputClass} required />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Check-out</span>
                    <input type="datetime-local" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className={inputClass} required />
                  </label>
                </div>
                <p className="text-[11px] text-muted-foreground">Times are in the team&apos;s timezone ({tz}).</p>

                {preview ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Mini label="Worked" value={hm(preview.workedMinutes)} />
                    <Mini label="Regular (paid)" value={hm(preview.regularMinutes)} tone="text-primary" />
                    <Mini label="Overtime (approved)" value={hm(preview.overtimeMinutes)} tone="text-accent" />
                    <Mini label="Unapproved extra" value={hm(preview.extraMinutes)} tone={preview.extraMinutes > 0 ? "text-danger" : undefined} />
                  </div>
                ) : (
                  <p className="text-xs text-danger">Check-out must be after check-in.</p>
                )}
                {preview && preview.extraMinutes > 0 && v.overtimeApprovedMinutes === 0 && (
                  <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
                    Time outside the schedule isn&apos;t overtime unless an overtime request is approved for this day.
                  </p>
                )}

                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                    {v.userName}&apos;s tasks on {dayLabel(v.date)} ({ctx!.tasks.length})
                  </p>
                  {ctx!.tasks.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No tasks were assigned for this day.</p>
                  ) : (
                    <ul className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
                      {ctx!.tasks.map((t) => (
                        <li key={t.id} className="flex items-center gap-2 text-xs">
                          {t.status === "COMPLETED" ? (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                          ) : (
                            <Circle className="h-3.5 w-3.5 shrink-0 text-warning" />
                          )}
                          <span className={t.status === "COMPLETED" ? "text-muted-foreground line-through" : ""}>{t.title}</span>
                          <span className="ml-auto text-[10px] uppercase text-muted-foreground">{t.status.replace("_", " ")}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <label className="flex items-start gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2 text-xs">
                  <input type="checkbox" checked={tasksConfirmed} onChange={(e) => setTasksConfirmed(e.target.checked)} className="mt-0.5" />
                  <span>
                    I confirm {v.userName}&apos;s scheduled tasks for this shift are complete
                    {openTasks.length > 0 ? ` — ${openTasks.length} still open, handed over or carried to the next shift` : ""}.
                  </span>
                </label>

                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  className={inputClass}
                  placeholder={noPunches ? "Note (required to mark absent)" : "Note (required to reject)"}
                />

                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="outline" disabled={!!busy} onClick={() => submit("REJECT")}>
                    {busy === "REJECT" ? "Saving…" : noPunches ? "Mark absent" : "Reject"}
                  </Button>
                  <Button disabled={!!busy || !preview || !tasksConfirmed} onClick={() => submit("APPROVE")}>
                    {busy === "APPROVE" ? "Saving…" : isSelf ? "Approve (self-approved)" : "Approve shift"}
                  </Button>
                </div>
              </div>
            )}

            {ctx!.audits.length > 0 && (
              <details className="rounded-xl border border-border px-3 py-2 text-xs">
                <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-muted-foreground">
                  <History className="h-3.5 w-3.5" /> History ({ctx!.audits.length})
                </summary>
                <ul className="mt-2 space-y-1.5">
                  {ctx!.audits.map((a) => (
                    <li key={a.id} className="flex flex-wrap gap-x-2">
                      <span className="font-mono text-muted-foreground">{formatClientDateTime(new Date(a.createdAt), tz)}</span>
                      <span className="font-medium">{ACTION_LABEL[a.action] ?? a.action}</span>
                      <span className="text-muted-foreground">by {a.actorName}</span>
                      {a.note && <span className="w-full text-muted-foreground">“{a.note}”</span>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: "danger" | "warning" | "info" | "accent" }) {
  const color = tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : tone === "info" ? "text-info" : tone === "accent" ? "text-accent" : "";
  return (
    <div className="rounded-xl border border-border/60 bg-muted/10 px-3 py-2">
      <dt className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 font-mono text-xs ${color}`}>{value}</dd>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className={`font-mono text-sm font-semibold tabular-nums ${tone ?? ""}`}>{value}</p>
    </div>
  );
}
