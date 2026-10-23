"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardList } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/shared/form-field";

/** "Create task" for a Listing Health issue or complaint theme; links to it once it exists. */
export function FixTaskButton({
  propertyId,
  issueKey,
  label,
  linked,
  people,
}: {
  propertyId: string;
  issueKey: string;
  label: string;
  linked?: { id: string; status: string };
  people: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [assignee, setAssignee] = useState("");
  const [busy, setBusy] = useState(false);

  if (linked && linked.status !== "COMPLETED") {
    return (
      <Link href="/tasks" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
        <ClipboardList className="h-3.5 w-3.5" /> Task open
      </Link>
    );
  }

  async function create() {
    setBusy(true);
    const res = await fetch(`/api/listing-health/${propertyId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: issueKey, assignedUserId: assignee || null }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Could not create the task");
      return;
    }
    toast.success(data.existed ? "A task for this is already open" : "Task created");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <ClipboardList className="h-3.5 w-3.5" /> {linked ? "New task" : "Create task"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Create a task" className="max-w-sm">
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">“{label}” becomes a task for today with the fix steps included.</p>
            <Field label="Assign to">
              <Select
                value={assignee}
                onValueChange={setAssignee}
                placeholder="Unassigned"
                options={[{ value: "", label: "Unassigned" }, ...people.map((p) => ({ value: p.id, label: p.name }))]}
              />
            </Field>
            <Button className="w-full" disabled={busy} onClick={create}>
              {busy ? "Creating…" : "Create task"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
