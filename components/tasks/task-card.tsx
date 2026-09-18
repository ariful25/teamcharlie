"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Badge, statusTone, priorityTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CheckCircle2, Clock, User2 } from "lucide-react";
import { toast } from "sonner";

export function TaskCard({ task }: { task: any }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Local, optimistic copy of the status — this is what actually renders,
  // so "Complete" flips the badge instantly instead of waiting on the
  // round-trip. Rolled back to the server's last-known value on failure.
  const [status, setStatus] = useState<string>(task.status);

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

  return (
    <motion.div whileHover={{ y: -2 }}>
      <Card className="p-4">
        <div className="flex items-start justify-between gap-2">
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
