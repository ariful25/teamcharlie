"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Dialog, DialogTrigger, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/shared/form-field";

export function ShiftTypesPanel({ shiftTypes: initial }: { shiftTypes: any[] }) {
  const [shiftTypes, setShiftTypes] = useState(initial);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("17:00");
  const [colorHex, setColorHex] = useState("#22d3ee");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch("/api/shift-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, startTime, endTime, colorHex, active: true }),
    });
    setSubmitting(false);
    if (res.ok) {
      const data = await res.json();
      setShiftTypes((prev) => [...prev, data.shiftType]);
      toast.success("Shift type added");
      setOpen(false);
      setName("");
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Could not add shift type");
    }
  }

  async function deactivate(id: string) {
    if (!confirm("Remove this shift type? Existing assignments keep their times.")) return;
    const res = await fetch(`/api/shift-types/${id}`, { method: "DELETE" });
    if (res.ok) {
      setShiftTypes((prev) => prev.filter((s) => s.id !== id));
      toast.success("Shift type removed");
    } else {
      toast.error("Could not remove shift type");
    }
  }

  return (
    <div className="space-y-2">
      {shiftTypes.map((s) => (
        <div key={s.id} className="flex items-center justify-between rounded-xl border border-border px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.colorHex }} />
            <span className="font-medium">{s.name}</span>
            <span className="text-muted-foreground">
              {s.startTime} – {s.endTime}
            </span>
          </div>
          <button onClick={() => deactivate(s.id)} className="text-xs text-muted-foreground hover:text-danger">
            Remove
          </button>
        </div>
      ))}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="secondary" size="sm" className="mt-2">
            <Plus className="h-3.5 w-3.5" /> Add Shift Type
          </Button>
        </DialogTrigger>
        <DialogContent title="Add Shift Type">
          <form onSubmit={handleSubmit} className="space-y-3">
            <Field label="Name">
              <input value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} placeholder="e.g. Backup" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start Time">
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required className={inputClass} />
              </Field>
              <Field label="End Time">
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required className={inputClass} />
              </Field>
            </div>
            <Field label="Color">
              <input
                type="color"
                value={colorHex}
                onChange={(e) => setColorHex(e.target.value)}
                className="h-10 w-full cursor-pointer rounded-xl border border-border bg-muted/40"
              />
            </Field>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Saving..." : "Add Shift Type"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
