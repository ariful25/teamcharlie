"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { AlertTriangle, Clock, Trash2, User2 } from "lucide-react";
import { Badge, priorityTone } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
import { Field, inputClass } from "@/components/shared/form-field";

// OVERDUE is computed by lib/services/task-generation.ts (a due time that's
// passed), never manually chosen — see QuickAddTaskModal's STATUS_OPTIONS,
// which excludes it for the same reason. It stays a real column here so
// overdue work is visible, but isn't a drop target.
const COLUMNS: { status: string; label: string; droppable: boolean }[] = [
  { status: "UPCOMING", label: "Upcoming", droppable: true },
  { status: "IN_PROGRESS", label: "In Progress", droppable: true },
  { status: "BLOCKED", label: "Blocked", droppable: true },
  { status: "OVERDUE", label: "Overdue", droppable: false },
  { status: "COMPLETED", label: "Completed", droppable: true },
];

function TaskCardMini({ task, dragging }: { task: any; dragging?: boolean }) {
  return (
    <div
      className={`glass space-y-2 rounded-xl border border-border/60 p-3 text-sm shadow-card transition ${
        dragging ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium leading-snug">{task.title}</p>
        <Badge tone={priorityTone(task.priority)}>{task.priority}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        {task.client?.name ?? "No client"} {task.category ? `· ${task.category.name}` : ""}
      </p>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" /> {task.startTime ?? "—"}–{task.dueTime ?? "—"}
        </span>
        <span className="flex items-center gap-1">
          <User2 className="h-3 w-3" /> {task.assignedUser?.name ?? "Unassigned"}
        </span>
      </div>
      {task.status === "BLOCKED" && task.blockedReason && (
        <p className="flex items-start gap-1 rounded-lg bg-danger/10 px-2 py-1 text-[11px] text-danger">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {task.blockedReason}
        </p>
      )}
    </div>
  );
}

function DraggableCard({ task, onDelete }: { task: any; onDelete: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  return (
    <div ref={setNodeRef} style={style} className="group relative">
      <div {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing">
        <TaskCardMini task={task} dragging={isDragging} />
      </div>
      <IconTooltip label="Delete task">
        <button
          onClick={() => onDelete(task.id)}
          aria-label="Delete task"
          className="absolute right-2 top-2 rounded-lg bg-card/80 p-1 text-muted-foreground opacity-0 transition hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </IconTooltip>
    </div>
  );
}

function Column({ status, label, droppable, tasks, onDelete }: { status: string; label: string; droppable: boolean; tasks: any[]; onDelete: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: !droppable });

  return (
    <div className="flex min-w-[260px] flex-1 flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{tasks.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-[120px] flex-1 flex-col gap-2 rounded-2xl border border-dashed p-2 transition-colors ${
          isOver ? "border-primary bg-primary/5" : "border-border/60"
        }`}
      >
        {tasks.length === 0 && <p className="p-3 text-center text-xs text-muted-foreground">Nothing here</p>}
        {tasks.map((t) => (
          <DraggableCard key={t.id} task={t} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

function BlockedReasonDialog({
  open,
  onSave,
  onSkip,
}: {
  open: boolean;
  onSave: (reason: string) => void;
  onSkip: () => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onSkip()}>
      <DialogContent title="What's blocking this task?" className="max-w-sm">
        <div className="space-y-3">
          <Field label="Reason (optional, but helps whoever picks this up)">
            <textarea
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className={inputClass}
              placeholder="e.g. Waiting on owner approval"
            />
          </Field>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onSkip}>
              Skip
            </Button>
            <Button className="flex-1" onClick={() => onSave(reason)}>
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TasksKanban({ tasks }: { tasks: any[] }) {
  const router = useRouter();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Optimistic per-task overrides (status + blockedReason), same pattern as
  // components/dashboard/todays-operations.tsx — `tasks` only changes on
  // router.refresh(), so a drag needs its own local state to move instantly.
  const [overrides, setOverrides] = useState<Record<string, { status?: string; blockedReason?: string | null }>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingBlock, setPendingBlock] = useState<{ id: string; previousStatus: string } | null>(null);

  function effectiveTask(task: any) {
    const override = overrides[task.id];
    return override ? { ...task, ...override } : task;
  }

  const visibleTasks = tasks.map(effectiveTask);
  const byStatus = (status: string) => visibleTasks.filter((t) => t.status === status);

  async function patchTask(id: string, data: Record<string, unknown>, previousStatus: string) {
    const res = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      router.refresh();
    } else {
      setOverrides((prev) => ({ ...prev, [id]: { status: previousStatus } }));
      toast.error("Could not update task — change reverted");
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const taskId = String(event.active.id);
    const overStatus = event.over?.id ? String(event.over.id) : null;
    if (!overStatus) return;

    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const currentStatus = overrides[taskId]?.status ?? task.status;
    if (overStatus === currentStatus) return;

    const previousStatus = currentStatus;
    setOverrides((prev) => ({ ...prev, [taskId]: { status: overStatus } }));

    if (overStatus === "BLOCKED") {
      // Card moves instantly; the reason dialog follows without blocking the
      // visual update.
      setPendingBlock({ id: taskId, previousStatus });
      return;
    }

    // Leaving BLOCKED for any other column clears a stale reason.
    const clearReason = previousStatus === "BLOCKED" ? { blockedReason: null } : {};
    if (Object.keys(clearReason).length) {
      setOverrides((prev) => ({ ...prev, [taskId]: { status: overStatus, blockedReason: null } }));
    }
    patchTask(taskId, { status: overStatus, ...clearReason }, previousStatus);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this task? It can be restored later from Recently Deleted.")) return;
    const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Task deleted");
      router.refresh();
    } else {
      toast.error("Could not delete task");
    }
  }

  const draggingTask = activeId ? visibleTasks.find((t) => t.id === activeId) : null;

  return (
    <>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {COLUMNS.map((col) => (
            <Column key={col.status} {...col} tasks={byStatus(col.status)} onDelete={handleDelete} />
          ))}
        </div>
        <DragOverlay>{draggingTask ? <TaskCardMini task={draggingTask} /> : null}</DragOverlay>
      </DndContext>

      <BlockedReasonDialog
        open={!!pendingBlock}
        onSave={(reason) => {
          if (!pendingBlock) return;
          const { id, previousStatus } = pendingBlock;
          setOverrides((prev) => ({ ...prev, [id]: { status: "BLOCKED", blockedReason: reason || null } }));
          patchTask(id, { status: "BLOCKED", blockedReason: reason || null }, previousStatus);
          setPendingBlock(null);
        }}
        onSkip={() => {
          if (!pendingBlock) return;
          const { id, previousStatus } = pendingBlock;
          patchTask(id, { status: "BLOCKED" }, previousStatus);
          setPendingBlock(null);
        }}
      />
    </>
  );
}
