"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/shared/form-field";
import { useTeamTimezone } from "@/components/providers/team-timezone";
import { clientDateKey, fromLocalInputValue } from "@/lib/time";
import { dayLabel } from "./ui";
import { DatePicker, DateTimePicker } from "@/components/ui/date-picker";

// "I forgot to punch" — the employee's claim. It never changes hours by
// itself: a team lead confirms both times later (docs/attendance-rules.md).
export function ClaimDialog({
  open,
  onOpenChange,
  defaultDate,
  mode = "both",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: string;
  mode?: "start" | "both";
}) {
  const tz = useTeamTimezone();
  const router = useRouter();
  const [date, setDate] = useState(defaultDate ?? clientDateKey(new Date(), tz));
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const a = start ? fromLocalInputValue(start, tz) : null;
    const b = end ? fromLocalInputValue(end, tz) : null;
    setBusy(true);
    const res = await fetch("/api/attendance/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, claimedCheckIn: a?.toISOString() ?? null, claimedCheckOut: b?.toISOString() ?? null, reason }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Could not send the correction");
      return;
    }
    toast.success("Sent to your team lead for approval");
    onOpenChange(false);
    setStart("");
    setEnd("");
    setReason("");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={mode === "start" ? "I started earlier" : "Fix a missed punch"} className="max-w-md">
        <form onSubmit={submit} className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">
            {mode === "start"
              ? "Your check-in stays as recorded. Tell your team lead when you really started — they confirm both times after your shift."
              : "Forgot to check in or out? Enter what really happened. Nothing changes until your team lead confirms it."}
          </p>
          <Field label="Shift day">
            <DatePicker value={date} onChange={(v) => setDate(v)} required />
          </Field>
          <p className="-mt-1 text-[11px] text-primary">Shift of {dayLabel(date, "EEEE, d MMMM")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="I started at">
              <DateTimePicker value={start} onChange={(v) => setStart(v)} required={mode === "start"} />
            </Field>
            {mode === "both" && (
              <Field label="I finished at">
                <DateTimePicker value={end} onChange={(v) => setEnd(v)} />
              </Field>
            )}
          </div>
          <Field label="What happened?">
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} required minLength={5} className={inputClass} placeholder="e.g. Forgot to check out after the handover call" />
          </Field>
          <Button type="submit" disabled={busy || (!start && !end)} className="w-full">
            {busy ? "Sending…" : "Send for approval"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
