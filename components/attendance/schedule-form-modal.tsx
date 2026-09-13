"use client";

import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogTrigger, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/shared/form-field";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ScheduleFormModal({ employees }: { employees: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);

  function toggleDay(d: number) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    const payload = {
      userId: form.get("userId"),
      scheduledCheckIn: form.get("scheduledCheckIn"),
      scheduledCheckOut: form.get("scheduledCheckOut"),
      days,
    };
    const res = await fetch("/api/attendance/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSubmitting(false);
    if (res.ok) {
      toast.success("Schedule saved");
      setOpen(false);
      window.location.reload();
    } else {
      toast.error("Could not save schedule");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="md">
          <CalendarClock className="h-4 w-4" /> Set Shift Schedule
        </Button>
      </DialogTrigger>
      <DialogContent title="Employee Shift Schedule">
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Employee">
            <select name="userId" required className={inputClass}>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Scheduled Check-in">
              <input type="time" name="scheduledCheckIn" required defaultValue="07:00" className={inputClass} />
            </Field>
            <Field label="Scheduled Check-out">
              <input type="time" name="scheduledCheckOut" required defaultValue="18:00" className={inputClass} />
            </Field>
          </div>
          <Field label="Repeat Days">
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d, i) => (
                <button
                  type="button"
                  key={d}
                  onClick={() => toggleDay(i)}
                  className={`rounded-lg border px-2.5 py-1 text-xs ${
                    days.includes(i) ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </Field>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Saving..." : "Save Schedule"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
