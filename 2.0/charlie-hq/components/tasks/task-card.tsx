"use client";

import { useTransition } from "react";
import { motion } from "framer-motion";
import { Badge, statusTone, priorityTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CheckCircle2, Clock, User2 } from "lucide-react";
import { toast } from "sonner";

export function TaskCard({ task }: { task: any }) {
  const [isPending, startTransition] = useTransition();

  function updateStatus(status: string) {
    startTransition(async () => {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        toast.success(`Marked ${status.toLowerCase().replace("_", " ")}`);
        window.location.reload();
      } else {
        toast.error("Could not update task");
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
          <Badge tone={statusTone(task.status)}>{task.status.replace("_", " ")}</Badge>
          {task.status !== "COMPLETED" && (
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
