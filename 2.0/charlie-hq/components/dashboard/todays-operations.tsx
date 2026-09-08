"use client";

import { useTransition } from "react";
import { Badge, statusTone, priorityTone } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { CheckCircle2, Clock3 } from "lucide-react";
import { toast } from "sonner";

export type OperationRow = {
  id: string;
  time: string | null;
  title: string;
  clientName: string | null;
  category: string | null;
  assignedTo: string | null;
  priority: string;
  status: string;
  dueTime: string | null;
  overdueBy?: string | null;
};

export function TodaysOperations({ rows }: { rows: OperationRow[] }) {
  const [isPending, startTransition] = useTransition();

  async function markComplete(id: string) {
    startTransition(async () => {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      });
      if (res.ok) {
        toast.success("Task marked complete");
        window.location.reload();
      } else {
        toast.error("Could not update task");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Today&apos;s Operations</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No tasks scheduled today.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-2 font-medium">Time</th>
                  <th className="px-5 py-2 font-medium">Task</th>
                  <th className="px-5 py-2 font-medium">Client</th>
                  <th className="px-5 py-2 font-medium">Category</th>
                  <th className="px-5 py-2 font-medium">Assigned</th>
                  <th className="px-5 py-2 font-medium">Priority</th>
                  <th className="px-5 py-2 font-medium">Status</th>
                  <th className="px-5 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/60 last:border-0 hover:bg-muted/20">
                    <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">{row.time ?? "—"}</td>
                    <td className="px-5 py-3 font-medium">{row.title}</td>
                    <td className="px-5 py-3 text-muted-foreground">{row.clientName ?? "—"}</td>
                    <td className="px-5 py-3 text-muted-foreground">{row.category ?? "—"}</td>
                    <td className="px-5 py-3 text-muted-foreground">{row.assignedTo ?? "Unassigned"}</td>
                    <td className="px-5 py-3">
                      <Badge tone={priorityTone(row.priority)}>{row.priority}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={statusTone(row.status)}>
                        {row.status === "OVERDUE" && row.overdueBy ? (
                          <span className="flex items-center gap-1">
                            <Clock3 className="h-3 w-3" /> {row.overdueBy} overdue
                          </span>
                        ) : (
                          row.status.replace("_", " ")
                        )}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      {row.status !== "COMPLETED" && (
                        <button
                          disabled={isPending}
                          onClick={() => markComplete(row.id)}
                          className="flex items-center gap-1 text-xs text-success hover:underline disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
