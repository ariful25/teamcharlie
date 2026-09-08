"use client";

import { useState } from "react";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { Dialog, DialogTrigger, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/shared/form-field";

export function AddEmployeeForm({
  employees,
  shiftTypes,
  weekStart,
  onAdded,
}: {
  employees: { id: string; name: string }[];
  shiftTypes: { id: string; name: string; colorHex: string }[];
  weekStart: string; // ISO
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [userId, setUserId] = useState("");
  const [shiftTypeId, setShiftTypeId] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!userId || !shiftTypeId) {
      toast.error("Pick an employee and a shift");
      return;
    }
    setSubmitting(true);
    const res = await fetch("/api/shift-schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, shiftTypeId, weekStart }),
    });
    setSubmitting(false);
    if (res.ok) {
      toast.success("Added to this week's roster");
      setOpen(false);
      setUserId("");
      setShiftTypeId("");
      onAdded();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Could not add employee");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <UserPlus className="h-3.5 w-3.5" /> Add to Roster
        </Button>
      </DialogTrigger>
      <DialogContent title="Add Employee to This Week">
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Employee">
            <Select
              value={userId}
              onValueChange={setUserId}
              placeholder="Choose employee"
              options={employees.map((e) => ({ value: e.id, label: e.name }))}
            />
          </Field>
          <Field label="Shift">
            <Select
              value={shiftTypeId}
              onValueChange={setShiftTypeId}
              placeholder="Choose shift"
              options={shiftTypes.map((s) => ({ value: s.id, label: s.name, dotColor: s.colorHex }))}
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            All 7 days will be set to Working with this shift's default times — flip
            individual days to Weekend/Leave afterward.
          </p>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Adding..." : "Add to Week"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
