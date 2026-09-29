"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge, statusTone, priorityTone } from "@/components/ui/badge";
import { formatClientLongDate } from "@/lib/time";

// Read-only for now — clicking a task card opens this instead of showing
// nothing beyond what's already on the card. Notes only ever get set at
// creation (see QuickAddTaskModal); editing them here can follow later if
// it's actually needed.
export function TaskDetailDialog({
  task,
  open,
  onOpenChange,
}: {
  task: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={task.title}>
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={priorityTone(task.priority)}>{task.priority}</Badge>
            <Badge tone={statusTone(task.status)}>{task.status.replace("_", " ")}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Date</p>
              <p className="mt-0.5">{formatClientLongDate(new Date(task.date))}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Time</p>
              <p className="mt-0.5">{task.startTime ?? "—"}–{task.dueTime ?? "—"}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Client</p>
              <p className="mt-0.5">{task.client?.name ?? "—"}{task.propertyName ? ` · ${task.propertyName}` : ""}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Category</p>
              <p className="mt-0.5">{task.category?.name ?? "Uncategorized"}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Assigned</p>
              <p className="mt-0.5">{task.assignedUser?.name ?? "Unassigned"}</p>
            </div>
          </div>

          {task.status === "BLOCKED" && task.blockedReason && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Blocked reason</p>
              <p className="mt-1 whitespace-pre-wrap rounded-lg bg-danger/10 px-3 py-2 text-danger">{task.blockedReason}</p>
            </div>
          )}

          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
            {task.notes ? (
              <p className="mt-1 whitespace-pre-wrap rounded-lg bg-muted/40 px-3 py-2">{task.notes}</p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">No notes added.</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
