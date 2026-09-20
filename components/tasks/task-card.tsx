"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Badge, statusTone, priorityTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Clock, Trash2, User2 } from "lucide-react";
import { toast } from "sonner";
import { IconTooltip } from "@/components/ui/tooltip";

export function TaskCard({ task }: { task: any }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Local, optimistic copy of the status — this is what actually renders,
  // so "Complete" flips the badge instantly instead of waiting on the
  // round-trip. Rolled back to the server's last-known value on failure.
  const [status, setStatus] = useState<string>(task.status);
  const [deleted, setDeleted] = useState(false);

  function updateStatus(nextStatus: string) {
    const previousStatus = status;
    setStatus(nextStatus);
    startTransition(async () => {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        toast.success(`Marked ${nextStatus.toLowerCase().replace("_", " ")}`);
        router.refresh();
      } else {
        setStatus(previousStatus);
        toast.error("Could not update task — change reverted");
      }
    });
  }

  async function handleDelete() {
    if (!confirm("Delete this task? It can be restored later from Recently Deleted.")) return;
    const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    if (res.ok) {
      // Deletion isn't optimistic — the card only disappears once the
      // server confirms, per the "never optimistic for deletes" rule.
      setDeleted(true);
      toast.success("Task deleted");
      router.refresh();
    } else {
      toast.error("Could not delete task");
    }
  }

  if (deleted) return null;

  return (
    <motion.div whileHover={{ y: -2 }}>
      <Card className="group relative p-4">
        <IconTooltip label="Delete task">
          <button
            onClick={handleDelete}
            aria-label="Delete task"
            className="absolute right-3 top-3 rounded-lg p-1 text-muted-foreground opacity-0 transition hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </IconTooltip>

        <div className="flex items-start justify-between gap-2 pr-6">
          <div>
            <p className="font-medium">{task.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {task.client?.name ?? "No client"} {task.category ? `· ${task.category.name}` : ""}
            </p>
          </div>
          <Badge tone={priorityTone(task.priority)}>{task.priority}</Badge>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> {task.startTime ?? "—"} - {task.dueTime ?? "—"}
          </span>
          <span className="flex items-center gap-1">
            <User2 className="h-3 w-3" /> {task.assignedUser?.name ?? "Unassigned"}
          </span>
        </div>

        {status === "BLOCKED" && task.blockedReason && (
          <p className="mt-2 flex items-start gap-1 rounded-lg bg-danger/10 px-2 py-1 text-xs text-danger">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {task.blockedReason}
          </p>
        )}

        <div className="mt-3 flex items-center justify-between">
          <Badge tone={statusTone(status)}>{status.replace("_", " ")}</Badge>
          {status !== "COMPLETED" && (
            <button
              disabled={isPending}
              onClick={() => updateStatus("COMPLETED")}
              className="flex items-center gap-1 text-xs text-success hover:underline disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Complete
            </button>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
