"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Field, inputClass } from "@/components/shared/form-field";
import { useTeamTimezone } from "@/components/providers/team-timezone";
import { clientDateKey } from "@/lib/time";
import { dayLabel } from "./ui";
import { DatePicker } from "@/components/ui/date-picker";

type Option = { id: string; name: string };

const DURATIONS = [30, 60, 90, 120, 150, 180, 240].map((m) => ({ value: String(m), label: m < 60 ? `${m} min` : `${m / 60} h`.replace(".5 h", "½ h") }));

// Overtime has to be requested and approved first — the in-app version of
// the old Google Form (same fields: date, how long, reason, who asked,
// public holiday). Leads/admins use the same dialog in "assign" mode to add
// pre-approved overtime for someone.
export function OvertimeDialog({
  open,
  onOpenChange,
  leads,
  employees,
  assign = false,
  defaultDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leads: Option[];
  employees?: Option[];
  assign?: boolean;
  defaultDate?: string;
}) {
  const tz = useTeamTimezone();
  const router = useRouter();
  const [userId, setUserId] = useState(employees?.[0]?.id ?? "");
  const [date, setDate] = useState(defaultDate ?? clientDateKey(new Date(), tz));
  const [minutes, setMinutes] = useState("60");
  const [reason, setReason] = useState("");
  const [askedById, setAskedById] = useState("");
  const [publicHoliday, setPublicHoliday] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/overtime", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: assign ? userId : null,
        date,
        minutes: Number(minutes),
        reason,
        askedById: askedById || null,
        publicHoliday,
        approveNow: assign,
      }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Could not save the request");
      return;
    }
    toast.success(assign ? "Overtime assigned and approved" : "Overtime requested — waiting for approval");
    onOpenChange(false);
    setReason("");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={assign ? "Assign overtime" : "Request overtime"} className="max-w-md">
        <form onSubmit={submit} className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">
            {assign
              ? "Adds overtime that's approved straight away. It counts only for time actually worked after the scheduled end."
              : "Ask before you stay late. Overtime only counts once a team lead or admin approves it — staying late without approval is not paid as overtime."}
          </p>
          {assign && employees && (
            <Field label="Employee">
              <Select value={userId} onValueChange={setUserId} options={employees.map((e) => ({ value: e.id, label: e.name }))} />
            </Field>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Shift day">
              <DatePicker value={date} onChange={(v) => setDate(v)} required />
            </Field>
            <Field label="Extra time">
              <Select value={minutes} onValueChange={setMinutes} options={DURATIONS} />
            </Field>
          </div>
          <p className="-mt-1 text-[11px] text-primary">After the shift of {dayLabel(date, "EEEE, d MMMM")}</p>
          <Field label="Reason">
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} required minLength={5} className={inputClass} placeholder="What needs the extra time?" />
          </Field>
          <Field label="Asked by">
            <Select
              value={askedById}
              onValueChange={setAskedById}
              placeholder="Nobody — my own request"
              options={[{ value: "", label: "Nobody — my own request" }, ...leads.map((l) => ({ value: l.id, label: l.name }))]}
            />
          </Field>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={publicHoliday} onChange={(e) => setPublicHoliday(e.target.checked)} />
            Public holiday (paid 2× per policy)
          </label>
          <p className="rounded-xl border border-border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
            Company limit: 10 working hours per day including overtime.
          </p>
          <Button type="submit" disabled={busy || (assign && !userId)} className="w-full">
            {busy ? "Saving…" : assign ? "Assign overtime" : "Send request"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
