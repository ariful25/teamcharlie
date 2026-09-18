"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, statusTone } from "@/components/ui/badge";
import { toast } from "sonner";

const NEXT_STATUS: Record<string, string> = {
  OPEN: "IN_PROGRESS",
  IN_PROGRESS: "RESOLVED",
  RESOLVED: "OPEN",
};

export function IssueStatusButton({ issue }: { issue: any }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<string>(issue.status);

  function advance() {
    const previousStatus = status;
    const nextStatus = NEXT_STATUS[status];
    setStatus(nextStatus);
    startTransition(async () => {
      const res = await fetch(`/api/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        toast.success("Issue status updated");
        router.refresh();
      } else {
        setStatus(previousStatus);
        toast.error("Could not update issue — change reverted");
      }
    });
  }

  return (
    <button disabled={isPending} onClick={advance} className="disabled:opacity-50">
      <Badge tone={statusTone(status)}>{status.replace("_", " ")}</Badge>
    </button>
  );
}
