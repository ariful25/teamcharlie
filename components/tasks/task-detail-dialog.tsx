"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Repeat } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge, statusTone, priorityTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Field, inputClass } from "@/components/shared/form-field";
import { TimePicker } from "@/components/ui/time-picker";
import { formatDayLong } from "@/lib/time";
import { DatePicker } from "@/components/ui/date-picker";

type Option = { id: string; name: string };

const PRIORITY_OPTIONS = [
  { value: "NORMAL", label: "Normal" },
  { value: "IMPORTANT", label: "Important" },
  { value: "URGENT", label: "Urgent" },
];

function EditForm({
  task,
  clients,
  employees,
  categories,
  onSaved,
  onCancel,
}: {
  task: any;
  clients: Option[];
  employees: Option[];
  categories: Option[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [clientId, setClientId] = useState(task.clientId ?? "");
  const [propertyName, setPropertyName] = useState(task.propertyName ?? "");
  const [categoryId, setCategoryId] = useState(task.categoryId ?? "");
  const [assignedUserId, setAssignedUserId] = useState(task.assignedUserId ?? "");
  const [date, setDate] = useState(new Date(task.date).toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState(task.startTime ?? "");
  const [dueTime, setDueTime] = useState(task.dueTime ?? "");
  const [priority, setPriority] = useState(task.priority);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [applyToSeries, setApplyToSeries] = useState(false);

  const isPartOfSeries = !!task.recurringTemplateId || task.isRecurringTemplate;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        edit: true,
        title,
        clientId: clientId || null,
        propertyName: propertyName || null,
        categoryId: categoryId || null,
        assignedUserId: assignedUserId || null,
        date,
        startTime: startTime || null,
        dueTime: dueTime || null,
        priority,
        notes: notes || null,
        applyToSeries: isPartOfSeries ? applyToSeries : undefined,
      }),
    });
    setSubmitting(false);
    if (res.ok) {
      toast.success("Task updated");
      router.refresh();
      onSaved();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Could not update task");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
      <Field label="Task Name" className="col-span-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} required className={inputClass} />
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
        <input value={propertyName} onChange={(e) => setPropertyName(e.target.value)} className={inputClass} placeholder="Optional" />
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
        <DatePicker value={date} onChange={(v) => setDate(v)} required />
      </Field>

      <Field label="Priority">
        <Select value={priority} onValueChange={setPriority} options={PRIORITY_OPTIONS} />
      </Field>

      <Field label="Start Time">
        <TimePicker value={startTime} onValueChange={setStartTime} />
      </Field>

      <Field label="Due Time">
        <TimePicker value={dueTime} onValueChange={setDueTime} />
      </Field>

      <Field label="Notes" className="col-span-2">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputClass} placeholder="Optional notes..." />
      </Field>

      {isPartOfSeries && (
        <label className="col-span-2 flex items-start gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={applyToSeries}
            onChange={(e) => setApplyToSeries(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Also apply to future occurrences of this recurring task — updates everything above except date and
            assigned employee, starting tomorrow. Today&rsquo;s task always gets the change either way.
          </span>
        </label>
      )}

      <div className="col-span-2 flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting} className="flex-1">
          {submitting ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}

const STATUS_OPTIONS = [
  { value: "UPCOMING", label: "Upcoming" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "COMPLETED", label: "Completed" },
];

// Status + series controls in view mode. Dragging between Kanban columns
// was the only way to change status besides "Complete", which doesn't work
// with a keyboard and fights scrolling on touch screens.
function TaskActions({ task, onDone }: { task: any; onDone: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [blockedReason, setBlockedReason] = useState(task.blockedReason ?? "");
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const isPartOfSeries = !!task.recurringTemplateId || task.isRecurringTemplate;

  async function saveStatus(status: string, reason?: string) {
    setBusy(true);
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(status === "BLOCKED" ? { status, blockedReason: reason || null } : { status }),
    });
    setBusy(false);
    if (res.ok) {
      toast.success(`Marked ${status.toLowerCase().replace("_", " ")}`);
      setPendingStatus(null);
      router.refresh();
      onDone();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Could not update task");
    }
  }

  async function stopSeries() {
    if (!confirm("Stop repeating this task? Today's task stays; no new ones will be created.")) return;
    setBusy(true);
    const res = await fetch(`/api/tasks/${task.id}?series=true`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      toast.success("Recurring series stopped");
      router.refresh();
      onDone();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Could not stop the series");
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Status" className="min-w-[160px] flex-1">
          <Select
            value={pendingStatus ?? (task.status === "OVERDUE" ? "" : task.status)}
            placeholder="Overdue"
            onValueChange={(next) => {
              if (!next || next === task.status) return;
              if (next === "BLOCKED") setPendingStatus("BLOCKED");
              else saveStatus(next);
            }}
            options={STATUS_OPTIONS}
          />
        </Field>
        {isPartOfSeries && (
          <Button type="button" variant="outline" disabled={busy} onClick={stopSeries} className="h-10">
            <Repeat className="h-4 w-4" /> Stop repeating
          </Button>
        )}
      </div>
      {pendingStatus === "BLOCKED" && (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="What's blocking it?" className="min-w-[200px] flex-1">
            <input
              autoFocus
              value={blockedReason}
              onChange={(e) => setBlockedReason(e.target.value)}
              className={inputClass}
              placeholder="e.g. Waiting on owner approval"
            />
          </Field>
          <Button type="button" variant="outline" className="h-10" onClick={() => setPendingStatus(null)}>
            Cancel
          </Button>
          <Button type="button" className="h-10" disabled={busy} onClick={() => saveStatus("BLOCKED", blockedReason)}>
            Mark blocked
          </Button>
        </div>
      )}
    </div>
  );
}

// Clicking a task card opens this. View mode shows everything including
// notes (which otherwise have no other place in the UI); the pencil button
// switches to an edit form. Editing always updates this specific day's task;
// if it's part of a recurring series, a checkbox additionally pushes the
// content fields onto the template so future days inherit the fix too.
export function TaskDetailDialog({
  task,
  open,
  onOpenChange,
  clients = [],
  employees = [],
  categories = [],
  readOnly = false,
}: {
  task: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients?: Option[];
  employees?: Option[];
  categories?: Option[];
  // A soft-deleted task (Task History) — every write to it 404s until it's
  // restored, so hide the edit/status controls instead of offering them.
  readOnly?: boolean;
}) {
  const [mode, setMode] = useState<"view" | "edit">("view");

  if (!task) return null;

  function handleOpenChange(next: boolean) {
    if (!next) setMode("view");
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent title={mode === "edit" ? `Edit: ${task.title}` : task.title}>
        {mode === "edit" ? (
          <EditForm
            task={task}
            clients={clients}
            employees={employees}
            categories={categories}
            onSaved={() => setMode("view")}
            onCancel={() => setMode("view")}
          />
        ) : (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={priorityTone(task.priority)}>{task.priority}</Badge>
                <Badge tone={statusTone(task.status)}>{task.status.replace("_", " ")}</Badge>
              </div>
              {!readOnly && (
                <button
                  onClick={() => setMode("edit")}
                  aria-label="Edit task"
                  className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-primary"
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
              )}
            </div>

            {!readOnly && <TaskActions task={task} onDone={() => handleOpenChange(false)} />}

            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">Date</p>
                <p className="mt-0.5">{formatDayLong(new Date(task.date))}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">Time</p>
                <p className="mt-0.5">{task.startTime ?? "—"}–{task.dueTime ?? "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">Client</p>
                <p className="mt-0.5">{task.client?.name ?? "—"}{task.propertyName ? ` · ${task.propertyName}` : ""}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">Category</p>
                <p className="mt-0.5">{task.category?.name ?? "Uncategorized"}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">Assigned</p>
                <p className="mt-0.5">
                  {task.assignedUser?.name ?? "Unassigned"}
                  {task.shiftType ? <span className="text-muted-foreground"> · {task.shiftType.name} shift</span> : null}
                </p>
              </div>
            </div>

            {task.status === "BLOCKED" && task.blockedReason && (
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">Blocked reason</p>
                <p className="mt-1 whitespace-pre-wrap rounded-lg bg-danger/10 px-3 py-2 text-danger">{task.blockedReason}</p>
              </div>
            )}

            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Notes</p>
              {task.notes ? (
                <p className="mt-1 whitespace-pre-wrap rounded-lg bg-muted/40 px-3 py-2">{task.notes}</p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">No notes added.</p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
