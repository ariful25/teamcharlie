"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Select } from "@/components/ui/select";
import { TaskCard } from "./task-card";
import { QuickAddTaskModal } from "./quick-add-task-modal";

export function TasksBoard({
  tasks,
  clients,
  employees,
  categories,
}: {
  tasks: any[];
  clients: any[];
  employees: any[];
  categories: any[];
}) {
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [clientId, setClientId] = useState(searchParams.get("clientId") ?? "");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [category, setCategory] = useState(searchParams.get("category") ?? "");

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (status && t.status !== status) return false;
      if (clientId && t.clientId !== clientId) return false;
      if (assignedUserId && t.assignedUserId !== assignedUserId) return false;
      if (category && t.category?.name !== category) return false;
      return true;
    });
  }, [tasks, search, status, clientId, assignedUserId, category]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              placeholder="Search tasks..."
              className="bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select
            className="w-auto min-w-[140px]"
            value={status}
            onValueChange={setStatus}
            placeholder="All Statuses"
            options={[
              { value: "", label: "All Statuses" },
              { value: "UPCOMING", label: "Upcoming" },
              { value: "IN_PROGRESS", label: "In Progress" },
              { value: "COMPLETED", label: "Completed" },
              { value: "OVERDUE", label: "Overdue" },
              { value: "BLOCKED", label: "Blocked" },
            ]}
          />
          <Select
            className="w-auto min-w-[140px]"
            value={clientId}
            onValueChange={setClientId}
            placeholder="All Clients"
            options={[{ value: "", label: "All Clients" }, ...clients.map((c) => ({ value: c.id, label: c.name }))]}
          />
          <Select
            className="w-auto min-w-[150px]"
            value={assignedUserId}
            onValueChange={setAssignedUserId}
            placeholder="All Employees"
            options={[{ value: "", label: "All Employees" }, ...employees.map((e) => ({ value: e.id, label: e.name }))]}
          />
        </div>
        <QuickAddTaskModal
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
          employees={employees.map((e) => ({ id: e.id, name: e.name }))}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border p-10 text-center text-sm text-muted-foreground">
          No tasks match these filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((t) => (
            <TaskCard key={t.id} task={t} />
          ))}
        </div>
      )}
    </div>
  );
}
