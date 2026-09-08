"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogTrigger, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/shared/form-field";

export function EditAttendanceModal({ record }: { record: any }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    const payload = {
      recordId: record.id,
      actualCheckIn: form.get("actualCheckIn") ? new Date(`${record.date.toISOString().slice(0, 10)}T${form.get("actualCheckIn")}:00`).toISOString() : null,
      actualCheckOut: form.get("actualCheckOut") ? new Date(`${record.date.toISOString().slice(0, 10)}T${form.get("actualCheckOut")}:00`).toISOString() : null,
      reason: form.get("reason"),
    };
    const res = await fetch("/api/attendance/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSubmitting(false);
    if (res.ok) {
      toast.success("Attendance record updated");
      setOpen(false);
      window.location.reload();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Could not update record");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/50">
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent title="Correct Attendance Record">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Actual Check-in">
              <input
                type="time"
                name="actualCheckIn"
                defaultValue={record.actualCheckIn ? new Date(record.actualCheckIn).toTimeString().slice(0, 5) : ""}
                className={inputClass}
              />
            </Field>
            <Field label="Actual Check-out">
              <input
                type="time"
                name="actualCheckOut"
                defaultValue={record.actualCheckOut ? new Date(record.actualCheckOut).toTimeString().slice(0, 5) : ""}
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Reason for edit">
            <textarea name="reason" required rows={3} className={inputClass} placeholder="Explain why this correction is needed..." />
          </Field>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Saving..." : "Save Correction"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
