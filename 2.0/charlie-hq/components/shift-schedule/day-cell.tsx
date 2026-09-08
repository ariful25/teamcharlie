"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogTrigger, DialogContent } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/shared/form-field";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "WORKING", label: "Working", dotColor: "#34d399" },
  { value: "WEEKEND", label: "Weekend", dotColor: "#f59e0b" },
  { value: "LEAVE", label: "Leave", dotColor: "#f87171" },
];

const STATUS_CLASS: Record<string, string> = {
  WORKING: "bg-success/15 text-success border-success/30 hover:bg-success/25",
  WEEKEND: "bg-warning/15 text-warning border-warning/30 hover:bg-warning/25",
  LEAVE: "bg-danger/15 text-danger border-danger/30 hover:bg-danger/25",
};

export type DayCellAssignment = {
  id: string | null;
  userId: string;
  date: string; // ISO
  status: "WORKING" | "WEEKEND" | "LEAVE";
  shiftTypeId: string | null;
  customStart: string | null;
  customEnd: string | null;
  note: string | null;
} | null;

export function DayCell({
  assignment,
  userId,
  date,
  defaultShiftTypeId,
  shiftTypes,
  canEdit,
  onSaved,
}: {
  assignment: DayCellAssignment;
  userId: string;
  date: string; // ISO date for this column
  defaultShiftTypeId: string | null;
  shiftTypes: { id: string; name: string; colorHex: string }[];
  canEdit: boolean;
  onSaved: (updated: NonNullable<DayCellAssignment>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState(assignment?.status ?? "WORKING");
  const [shiftTypeId, setShiftTypeId] = useState(assignment?.shiftTypeId ?? defaultShiftTypeId ?? "");
  const [customStart, setCustomStart] = useState(assignment?.customStart ?? "");
  const [customEnd, setCustomEnd] = useState(assignment?.customEnd ?? "");
  const [note, setNote] = useState(assignment?.note ?? "");

  useEffect(() => {
    setStatus(assignment?.status ?? "WORKING");
    setShiftTypeId(assignment?.shiftTypeId ?? defaultShiftTypeId ?? "");
    setCustomStart(assignment?.customStart ?? "");
    setCustomEnd(assignment?.customEnd ?? "");
    setNote(assignment?.note ?? "");
  }, [assignment, defaultShiftTypeId]);

  const label = assignment
    ? assignment.status === "WORKING"
      ? "Working"
      : assignment.status.charAt(0) + assignment.status.slice(1).toLowerCase()
    : "—";

  async function handleSave() {
    setSubmitting(true);
    const res = await fetch("/api/shift-schedule/day", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        date,
        status,
        shiftTypeId: status === "WORKING" ? shiftTypeId || assignment?.shiftTypeId || defaultShiftTypeId : assignment?.shiftTypeId ?? defaultShiftTypeId,
        customStart: customStart || null,
        customEnd: customEnd || null,
        note: note || null,
      }),
    });
    setSubmitting(false);
    if (res.ok) {
      const data = await res.json();
      onSaved(data.assignment);
      toast.success("Day updated");
      setOpen(false);
    } else {
      toast.error("Could not update day");
    }
  }

  if (!canEdit) {
    return (
      <div
        className={cn(
          "flex h-14 w-full items-center justify-center rounded-lg border text-xs font-medium",
          assignment ? STATUS_CLASS[assignment.status] : "border-border/50 text-muted-foreground/50"
        )}
      >
        {label}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className={cn(
            "flex h-14 w-full flex-col items-center justify-center rounded-lg border text-xs font-medium transition-colors",
            assignment
              ? STATUS_CLASS[assignment.status]
              : "border-dashed border-border/50 text-muted-foreground/50 hover:border-primary/40 hover:text-primary"
          )}
        >
          {label}
          {assignment?.note && <span className="mt-0.5 truncate px-1 text-[10px] opacity-80">{assignment.note}</span>}
        </button>
      </DialogTrigger>
      <DialogContent title="Edit Day">
        <div className="space-y-3">
          <Field label="Status">
            <Select value={status} onValueChange={(v) => setStatus(v as any)} options={STATUS_OPTIONS} />
          </Field>
          {status === "WORKING" && (
            <>
              <Field label="Shift Type">
                <Select
                  value={shiftTypeId}
                  onValueChange={setShiftTypeId}
                  placeholder="Choose shift"
                  options={shiftTypes.map((shift) => ({ value: shift.id, label: shift.name, dotColor: shift.colorHex }))}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Custom Start (optional)">
                  <input type="time" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className={inputClass} />
                </Field>
                <Field label="Custom End (optional)">
                  <input type="time" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className={inputClass} />
                </Field>
              </div>
            </>
          )}
          <Field label="Note">
            <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} placeholder="e.g. 3 PM to 12 AM" />
          </Field>
          <Button onClick={handleSave} disabled={submitting} className="w-full">
            {submitting ? "Saving..." : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
