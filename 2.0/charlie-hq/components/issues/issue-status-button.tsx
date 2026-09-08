"use client";

import { useTransition } from "react";
import { Badge, statusTone } from "@/components/ui/badge";
import { toast } from "sonner";

const NEXT_STATUS: Record<string, string> = {
  OPEN: "IN_PROGRESS",
  IN_PROGRESS: "RESOLVED",
  RESOLVED: "OPEN",
};

export function IssueStatusButton({ issue }: { issue: any }) {
  const [isPending, startTransition] = useTransition();

  function advance() {
    startTransition(async () => {
      const res = await fetch(`/api/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: NEXT_STATUS[issue.status] }),
      });
      if (res.ok) {
        toast.success("Issue status updated");
        window.location.reload();
      } else {
        toast.error("Could not update issue");
      }
    });
  }

  return (
    <button disabled={isPending} onClick={advance} className="disabled:opacity-50">
      <Badge tone={statusTone(issue.status)}>{issue.status.replace("_", " ")}</Badge>
    </button>
  );
}
