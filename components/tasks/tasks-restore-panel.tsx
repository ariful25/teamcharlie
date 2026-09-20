"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export function TasksRestorePanel() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deletedTasks, setDeletedTasks] = useState<any[]>([]);

  async function handleOpen(next: boolean) {
    setOpen(next);
    if (!next) return;
    setLoading(true);
    try {
      const res = await fetch("/api/tasks?deleted=true");
      const data = await res.json();
      setDeletedTasks(data.tasks ?? []);
    } catch {
      toast.error("Could not load deleted tasks");
    } finally {
      setLoading(false);
    }
  }

  async function restore(id: string) {
    const res = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restore: true }),
    });
    if (res.ok) {
      toast.success("Task restored");
      setDeletedTasks((prev) => prev.filter((t) => t.id !== id));
      router.refresh();
    } else {
      toast.error("Could not restore task");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <Button variant="outline" className="h-10" onClick={() => handleOpen(true)}>
        <Trash2 className="h-4 w-4" /> Recently Deleted
      </Button>
      <DialogContent title="Recently Deleted Tasks" className="max-w-lg">
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading...</p>
        ) : deletedTasks.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nothing deleted recently.</p>
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {deletedTasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 p-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{task.title}</p>
                  <p className="text-xs text-muted-foreground">{task.client?.name ?? "No client"}</p>
                </div>
                <Button variant="outline" className="h-8 shrink-0 px-3 text-xs" onClick={() => restore(task.id)}>
                  Restore
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
