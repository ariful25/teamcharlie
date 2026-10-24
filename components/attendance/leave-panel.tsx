"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { IconTooltip } from "@/components/ui/tooltip";
import { Field, inputClass } from "@/components/shared/form-field";
import type { LeaveView } from "@/lib/leave/service";
import { Chip, Panel, dayLabel } from "./ui";
import { DatePicker } from "@/components/ui/date-picker";

type Balance = { allowance: number | null; used: number; pending: number };
type Balances = { PAID: Balance; SICK: Balance; UNPAID: Balance };

export const LEAVE_LABEL = { PAID: "Paid leave", SICK: "Sick leave", UNPAID: "Unpaid leave" } as const;

export function leaveStatusTone(status: string) {
  return status === "APPROVED" ? "success" : status === "PENDING" ? "info" : status === "REJECTED" ? "danger" : "muted";
}

export function leaveRange(r: { startDate: string; endDate: string }) {
  return r.startDate === r.endDate ? dayLabel(r.startDate) : `${dayLabel(r.startDate)} – ${dayLabel(r.endDate)}`;
}

/** The signed-in person's leave: balances, request form and their requests. */
export function LeavePanel({ balances, requests, today }: { balances: Balances; requests: LeaveView[]; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"PAID" | "SICK" | "UNPAID">("PAID");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, startDate, endDate, reason }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Could not send the request");
      return;
    }
    toast.success(`Leave requested (${data.request.days} day${data.request.days === 1 ? "" : "s"}) — waiting for approval`);
    setOpen(false);
    setReason("");
    router.refresh();
  }

  async function cancel(id: string) {
    const res = await fetch(`/api/leave/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Request cancelled");
      router.refresh();
    } else toast.error("Could not cancel");
  }

  return (
    <Panel
      title="My leave"
      action={
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          <CalendarPlus className="h-3.5 w-3.5" /> Request leave
        </Button>
      }
    >
      <div className="grid grid-cols-3 gap-3 border-b border-border/60 px-5 py-4 text-sm">
        {(["PAID", "SICK", "UNPAID"] as const).map((t) => {
          const b = balances[t];
          return (
            <div key={t}>
              <p className="text-xs text-muted-foreground">{LEAVE_LABEL[t]}</p>
              <p className="text-lg font-semibold tabular-nums">
                {b.allowance === null ? `${b.used} used` : `${Math.max(0, b.allowance - b.used)} left`}
              </p>
              <p className="text-xs text-muted-foreground">
                {b.allowance === null ? "no limit" : `of ${b.allowance} this year`}
                {b.pending ? ` · ${b.pending} pending` : ""}
              </p>
            </div>
          );
        })}
      </div>
      {requests.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-muted-foreground">No leave requests yet.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {requests.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{leaveRange(r)}</span>
                  <Chip tone={leaveStatusTone(r.status)}>{r.status.toLowerCase()}</Chip>
                  <span className="text-xs text-muted-foreground">
                    {LEAVE_LABEL[r.type]} · {r.days} day{r.days === 1 ? "" : "s"}
                  </span>
                </div>
                <p className="truncate text-xs text-muted-foreground">{r.reason}</p>
                {r.reviewNote && <p className="text-xs text-muted-foreground">“{r.reviewNote}”{r.reviewedByName ? ` — ${r.reviewedByName}` : ""}</p>}
              </div>
              {r.status === "PENDING" && (
                <IconTooltip label="Cancel request">
                  <button onClick={() => cancel(r.id)} aria-label="Cancel leave request" className="rounded-lg p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger">
                    <X className="h-4 w-4" />
                  </button>
                </IconTooltip>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Request leave" className="max-w-md">
          <form onSubmit={submit} className="space-y-3 text-sm">
            <Field label="Type">
              <Select value={type} onValueChange={(v) => setType(v as typeof type)} options={(["PAID", "SICK", "UNPAID"] as const).map((t) => ({ value: t, label: LEAVE_LABEL[t] }))} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="From">
                <DatePicker value={startDate} onChange={(v) => setStartDate(v)} required />
              </Field>
              <Field label="To (inclusive)">
                <DatePicker value={endDate} min={startDate} onChange={(v) => setEndDate(v)} required />
              </Field>
            </div>
            <Field label="Reason">
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} required minLength={3} className={inputClass} placeholder="e.g. Family event" />
            </Field>
            <p className="text-xs text-muted-foreground">Weekend days on your schedule aren&apos;t counted. Once approved, the days show as leave on the Shift Schedule.</p>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Sending…" : "Send request"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

/** Team Attendance → Leave: pending approvals and recent decisions. */
export function LeaveBoard({ pending, recent, currentUser }: { pending: LeaveView[]; recent: LeaveView[]; currentUser: { id: string; role: string } }) {
  const router = useRouter();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function decide(id: string, action: "APPROVE" | "REJECT" | "REVOKE") {
    if (action === "REVOKE" && !confirm("Revoke this approved leave? The schedule goes back to what it was.")) return;
    setBusy(id);
    const res = await fetch(`/api/leave/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note: notes[id] || null }),
    });
    setBusy(null);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Could not save");
      return;
    }
    toast.success(action === "APPROVE" ? "Leave approved — added to the Shift Schedule" : action === "REJECT" ? "Leave rejected" : "Leave revoked");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Panel title="Waiting for approval">
        {pending.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">No leave requests waiting.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {pending.map((r) => {
              const own = r.userId === currentUser.id && currentUser.role !== "ADMIN";
              return (
                <li key={r.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div className="space-y-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{r.userName}</span>
                      <Chip tone="info">{LEAVE_LABEL[r.type]}</Chip>
                      <span className="text-muted-foreground">
                        {leaveRange(r)} · {r.days} day{r.days === 1 ? "" : "s"}
                      </span>
                    </div>
                    <p className="text-xs">{r.reason}</p>
                  </div>
                  {own ? (
                    <p className="text-xs text-muted-foreground">Your own request — another lead or an admin decides.</p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={notes[r.id] ?? ""}
                        onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                        placeholder="Note"
                        aria-label="Decision note"
                        className={`${inputClass} h-10 w-[160px]`}
                      />
                      <Button variant="outline" disabled={busy === r.id} onClick={() => decide(r.id, "REJECT")}>
                        Reject
                      </Button>
                      <Button disabled={busy === r.id} onClick={() => decide(r.id, "APPROVE")}>
                        Approve
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <Panel title="Recent decisions">
        {recent.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nothing decided yet.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.userName}</span>
                  <Chip tone={leaveStatusTone(r.status)}>{r.status.toLowerCase()}</Chip>
                  <span className="text-xs text-muted-foreground">
                    {LEAVE_LABEL[r.type]} · {leaveRange(r)} · {r.days}d{r.reviewedByName ? ` · by ${r.reviewedByName}` : ""}
                  </span>
                </div>
                {r.status === "APPROVED" && (
                  <div className="flex items-center gap-2">
                    <input
                      value={notes[r.id] ?? ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                      placeholder="Reason to revoke"
                      aria-label="Reason to revoke"
                      className={`${inputClass} h-8 w-[150px] text-xs`}
                    />
                    <Button size="sm" variant="outline" disabled={busy === r.id || !(notes[r.id] ?? "").trim()} onClick={() => decide(r.id, "REVOKE")}>
                      Revoke
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
