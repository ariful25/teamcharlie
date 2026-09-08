"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogTrigger, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Field, inputClass } from "@/components/shared/form-field";

type Option = { id: string; name: string };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const PRIORITY_OPTIONS = [
  { value: "NORMAL", label: "Normal", dotColor: "#94a3b8" },
  { value: "IMPORTANT", label: "Important", dotColor: "#facc15" },
  { value: "URGENT", label: "Urgent", dotColor: "#f87171" },
];

const STATUS_OPTIONS = [
  { value: "UPCOMING", label: "Upcoming" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "COMPLETED", label: "Completed" },
  { value: "BLOCKED", label: "Blocked" },
];

const REPEAT_OPTIONS = [
  { value: "NONE", label: "Does not repeat" },
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "CUSTOM", label: "Custom" },
];

export function QuickAddTaskModal({
  clients,
  employees,
  categories,
}: {
  clients: Option[];
  employees: Option[];
  categories: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [propertyName, setPropertyName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [status, setStatus] = useState("UPCOMING");
  const [notes, setNotes] = useState("");
  const [repeatMode, setRepeatMode] = useState("NONE");
  const [repeatDays, setRepeatDays] = useState<number[]>([]);

  function toggleDay(d: number) {
    setRepeatDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const payload = {
      title,
      clientId: clientId || null,
      propertyName: propertyName || null,
      categoryId: categoryId || null,
      assignedUserId: assignedUserId || null,
      date,
      startTime: startTime || null,
      dueTime: dueTime || null,
      priority,
      status,
      notes,
      repeatMode,
      repeatDays,
    };

    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSubmitting(false);
    if (res.ok) {
      toast.success("Task created");
      setOpen(false);
      window.location.reload();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Could not create task");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="shadow-glow">
          <Plus className="h-4 w-4" /> Add Task
        </Button>
      </DialogTrigger>
      <DialogContent title="Add Task">
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
          <Field label="Task Name" className="col-span-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className={inputClass}
              placeholder="e.g. Follow up with guest"
            />
          </Field>

          <Field label="Client">
            <Select
              value={clientId}
              onValueChange={setClientId}
              placeholder="Unassigned"
              options={[{ value: "", label: "Unassigned" }, ...clients.map((c) => ({ value: c.id, label: c.name }))]}
            />
          </Field>

          <Field label="Property">
            <input
              value={propertyName}
              onChange={(e) => setPropertyName(e.target.value)}
              className={inputClass}
              placeholder="Optional"
            />
          </Field>

          <Field label="Category">
            <Select
              value={categoryId}
              onValueChange={setCategoryId}
              placeholder="None"
              options={[{ value: "", label: "None" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
            />
          </Field>

          <Field label="Assigned Employee">
            <Select
              value={assignedUserId}
              onValueChange={setAssignedUserId}
              placeholder="Unassigned"
              options={[{ value: "", label: "Unassigned" }, ...employees.map((e) => ({ value: e.id, label: e.name }))]}
            />
          </Field>

          <Field label="Date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={inputClass} />
          </Field>

          <Field label="Priority">
            <Select value={priority} onValueChange={setPriority} options={PRIORITY_OPTIONS} />
          </Field>

          <Field label="Start Time">
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputClass} />
          </Field>

          <Field label="Due Time">
            <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} className={inputClass} />
          </Field>

          <Field label="Status">
            <Select value={status} onValueChange={setStatus} options={STATUS_OPTIONS} />
          </Field>

          <Field label="Repeat">
            <Select value={repeatMode} onValueChange={setRepeatMode} options={REPEAT_OPTIONS} />
          </Field>

          {(repeatMode === "WEEKLY" || repeatMode === "CUSTOM") && (
            <div className="col-span-2 flex flex-wrap gap-2">
              {DAYS.map((d, i) => (
                <button
                  type="button"
                  key={d}
                  onClick={() => toggleDay(i)}
                  className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                    repeatDays.includes(i)
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          )}

          <Field label="Notes" className="col-span-2">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={inputClass}
              placeholder="Optional notes..."
            />
          </Field>

          <Button type="submit" disabled={submitting} className="col-span-2 mt-2">
            {submitting ? "Creating..." : "Create Task"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
