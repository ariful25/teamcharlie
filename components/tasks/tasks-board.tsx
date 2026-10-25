"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search, LayoutGrid, List as ListIcon, History, CheckCircle2, ChevronDown, Clock3 } from "lucide-react";
import { boardPhase } from "@/lib/tasks/visibility";
import { useTeamTimezone } from "@/components/providers/team-timezone";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { TaskCard } from "./task-card";
import { TasksKanban } from "./tasks-kanban";
import { QuickAddTaskModal } from "./quick-add-task-modal";

export function TasksBoard({
  tasks,
  clients,
  employees,
  categories,
  shiftTypes,
  currentUserId,
}: {
  tasks: any[];
  clients: any[];
  employees: any[];
  categories: any[];
  shiftTypes: any[];
  currentUserId: string;
}) {
  const searchParams = useSearchParams();
  const [view, setView] = useState<"board" | "list">("board");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [clientId, setClientId] = useState(searchParams.get("clientId") ?? "");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [category, setCategory] = useState(searchParams.get("category") ?? "");
  const [myTasksOnly, setMyTasksOnly] = useState(false);
  const [showDone, setShowDone] = useState(searchParams.get("status") === "COMPLETED");
  const [laterOpen, setLaterOpen] = useState(false);
  const tz = useTeamTimezone();

  // Ticks so completed tasks leave after their 5-minute window and shift
  // tasks arrive when the shift starts, without anyone reloading the page.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const phaseOf = (t: any) => boardPhase(t, now);
  const doneToday = tasks.filter((t) => t.status === "COMPLETED");
  const later = tasks.filter((t) => phaseOf(t) === "later").sort((a, b) => a.releaseAt.localeCompare(b.releaseAt));
  const laterGroups = later.reduce<{ key: string; label: string; count: number }[]>((acc, t) => {
    const label = `${t.shiftType?.name ?? "Shift"} · ${formatTime(new Date(t.releaseAt), tz)}`;
    const g = acc.find((x) => x.key === t.releaseAt);
    if (g) g.count++;
    else acc.push({ key: t.releaseAt, label, count: 1 });
    return acc;
  }, []);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      const phase = phaseOf(t);
      if (phase === "later") return false;
      if (phase === "done" && !showDone && !(view === "list" && status === "COMPLETED")) return false;
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      // The board view already partitions by status via its columns —
      // applying the status dropdown on top of it would just empty out
      // every column but one, so it only applies in list view.
      if (view === "list" && status && t.status !== status) return false;
      if (clientId && t.clientId !== clientId) return false;
      if (myTasksOnly && t.assignedUserId !== currentUserId) return false;
      else if (assignedUserId && t.assignedUserId !== assignedUserId) return false;
      if (category && t.category?.name !== category) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, search, status, clientId, assignedUserId, category, myTasksOnly, currentUserId, view, now, showDone]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border border-border p-0.5">
            <button
              onClick={() => setView("board")}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                view === "board" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Board
            </button>
            <button
              onClick={() => setView("list")}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                view === "list" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ListIcon className="h-3.5 w-3.5" /> List
            </button>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              placeholder="Search tasks..."
              aria-label="Search tasks"
              className="bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => setMyTasksOnly((v) => !v)}
            className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
              myTasksOnly ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            My Tasks
          </button>
          {view === "list" && (
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
          )}
          <Select
            className="w-auto min-w-[140px]"
            value={clientId}
            onValueChange={setClientId}
            placeholder="All Clients"
            options={[{ value: "", label: "All Clients" }, ...clients.map((c) => ({ value: c.id, label: c.name }))]}
          />
          {!myTasksOnly && (
            <Select
              className="w-auto min-w-[150px]"
              value={assignedUserId}
              onValueChange={setAssignedUserId}
              placeholder="All Employees"
              options={[{ value: "", label: "All Employees" }, ...employees.map((e) => ({ value: e.id, label: e.name }))]}
            />
          )}
          <Select
            className="w-auto min-w-[150px]"
            value={category}
            onValueChange={setCategory}
            placeholder="All Categories"
            options={[{ value: "", label: "All Categories" }, ...categories.map((c) => ({ value: c.name, label: c.name }))]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {doneToday.length > 0 && (
            <Button
              variant="ghost"
              className="h-10"
              aria-pressed={showDone}
              onClick={() => setShowDone((v) => !v)}
              title={showDone ? "Hide tasks completed earlier today" : "Show everything completed today"}
            >
              <CheckCircle2 className={cn("h-4 w-4", showDone ? "text-success" : "text-muted-foreground")} />
              {showDone ? "Hide completed" : `${doneToday.length} done today`}
            </Button>
          )}
          <Link href="/tasks/history">
            <Button variant="outline" className="h-10">
              <History className="h-4 w-4" /> History
            </Button>
          </Link>
          <QuickAddTaskModal
            clients={clients.map((c) => ({ id: c.id, name: c.name }))}
            employees={employees.map((e) => ({ id: e.id, name: e.name }))}
            categories={categories.map((c) => ({ id: c.id, name: c.name }))}
            shiftTypes={shiftTypes.map((s) => ({ id: s.id, name: s.name }))}
          />
        </div>
      </div>

      {later.length > 0 && (
        <div className="glass rounded-2xl text-sm shadow-card">
          <button
            type="button"
            onClick={() => setLaterOpen((v) => !v)}
            aria-expanded={laterOpen}
            className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-left"
          >
            <Clock3 className="h-4 w-4 text-primary" />
            <span className="font-medium">
              {later.length} recurring task{later.length === 1 ? "" : "s"} start{later.length === 1 ? "s" : ""} with a later shift
            </span>
            <span className="text-xs text-muted-foreground">{laterGroups.map((g) => `${g.label} (${g.count})`).join(" · ")}</span>
            <ChevronDown className={cn("ml-auto h-4 w-4 text-muted-foreground transition-transform", laterOpen && "rotate-180")} />
          </button>
          {laterOpen && (
            <ul className="divide-y divide-border/60 border-t border-border/60">
              {later.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <span className="min-w-0 truncate">{t.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {t.shiftType?.name} · from {formatTime(new Date(t.releaseAt), tz)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border p-10 text-center text-sm text-muted-foreground">
          No tasks match these filters.
        </div>
      ) : view === "board" ? (
        <TasksKanban
          tasks={filtered}
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
          employees={employees.map((e) => ({ id: e.id, name: e.name }))}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              clients={clients.map((c) => ({ id: c.id, name: c.name }))}
              employees={employees.map((e) => ({ id: e.id, name: e.name }))}
              categories={categories.map((c) => ({ id: c.id, name: c.name }))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
