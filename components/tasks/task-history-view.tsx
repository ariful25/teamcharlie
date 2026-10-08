"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { Badge, priorityTone } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Field, inputClass } from "@/components/shared/form-field";
import { TaskDetailDialog } from "./task-detail-dialog";

type Option = { id: string; name: string };

type Filters = {
  status: "ALL" | "COMPLETED" | "DELETED";
  clientId: string;
  assignedUserId: string;
  from: string;
  to: string;
};

const STATUS_TABS: { value: Filters["status"]; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "COMPLETED", label: "Completed" },
  { value: "DELETED", label: "Deleted" },
];

function HistoryRow({ task }: { task: any }) {
  const router = useRouter();
  const [detailOpen, setDetailOpen] = useState(false);
  const [restored, setRestored] = useState(false);
  const isDeleted = !!task.deletedAt;

  async function restore(e: React.MouseEvent) {
    e.stopPropagation();
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restore: true }),
    });
    if (res.ok) {
      toast.success("Task restored — back on the board");
      setRestored(true);
      router.refresh();
    } else {
      toast.error("Could not restore task");
    }
  }

  if (restored) return null;

  return (
    <>
      <div
        onClick={() => setDetailOpen(true)}
        className="flex cursor-pointer items-center justify-between gap-3 border-t border-border/60 px-5 py-3 text-sm first:border-0 hover:bg-muted/20"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium">{task.title}</p>
            <Badge tone={priorityTone(task.priority)}>{task.priority}</Badge>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {new Date(task.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} ·{" "}
            {task.client?.name ?? "No client"} · {task.assignedUser?.name ?? "Unassigned"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={isDeleted ? "danger" : "success"}>{isDeleted ? "Deleted" : "Completed"}</Badge>
          {isDeleted && (
            <button
              onClick={restore}
              aria-label="Restore task"
              className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-primary"
            >
              <RotateCcw className="h-3 w-3" /> Restore
            </button>
          )}
        </div>
      </div>
      <TaskDetailDialog task={task} open={detailOpen} onOpenChange={setDetailOpen} />
    </>
  );
}

export function TaskHistoryView({
  tasks,
  clients,
  employees,
  filters,
}: {
  tasks: any[];
  clients: Option[];
  employees: Option[];
  filters: Filters;
}) {
  const router = useRouter();

  function updateFilter(patch: Partial<Filters>) {
    const next = { ...filters, ...patch };
    const params = new URLSearchParams();
    if (next.status !== "ALL") params.set("status", next.status);
    if (next.clientId) params.set("clientId", next.clientId);
    if (next.assignedUserId) params.set("assignedUserId", next.assignedUserId);
    if (next.from) params.set("from", next.from);
    if (next.to) params.set("to", next.to);
    router.push(`/tasks/history${params.toString() ? `?${params.toString()}` : ""}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center rounded-xl border border-border p-0.5">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => updateFilter({ status: tab.value })}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                filters.status === tab.value ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <Field label="Client" className="w-auto min-w-[160px]">
          <Select
            value={filters.clientId}
            onValueChange={(v) => updateFilter({ clientId: v })}
            placeholder="All Clients"
            options={[{ value: "", label: "All Clients" }, ...clients.map((c) => ({ value: c.id, label: c.name }))]}
          />
        </Field>

        <Field label="Employee" className="w-auto min-w-[160px]">
          <Select
            value={filters.assignedUserId}
            onValueChange={(v) => updateFilter({ assignedUserId: v })}
            placeholder="All Employees"
            options={[{ value: "", label: "All Employees" }, ...employees.map((e) => ({ value: e.id, label: e.name }))]}
          />
        </Field>

        <Field label="From" className="w-auto">
          <input type="date" value={filters.from} onChange={(e) => updateFilter({ from: e.target.value })} className={inputClass} />
        </Field>

        <Field label="To" className="w-auto">
          <input type="date" value={filters.to} onChange={(e) => updateFilter({ to: e.target.value })} className={inputClass} />
        </Field>
      </div>

      <div className="glass overflow-hidden rounded-2xl shadow-card">
        {tasks.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Nothing matches these filters.</p>
        ) : (
          tasks.map((task) => <HistoryRow key={task.id} task={task} />)
        )}
      </div>
      {tasks.length === 300 && (
        <p className="text-center text-xs text-muted-foreground">Showing the most recent 300 — narrow the date range to see more precisely.</p>
      )}
    </div>
  );
}
