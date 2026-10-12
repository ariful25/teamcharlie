"use client";

import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type ChecklistItem = { id: string; label: string };

// Gates the actual checkout call behind confirming every item — see
// shift-card.tsx's handleCheckOut, which opens this instead of calling
// /api/attendance/checkout directly whenever the team has active checkout
// checklist items configured (Settings > Checkout Checklist).
export function CheckoutChecklistDialog({
  open,
  onOpenChange,
  items,
  onConfirm,
  submitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: ChecklistItem[];
  onConfirm: (checklist: { id: string; label: string; checked: boolean }[]) => void;
  submitting: boolean;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const allChecked = items.length > 0 && items.every((item) => checked[item.id]);

  function toggle(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function handleConfirm() {
    onConfirm(items.map((item) => ({ id: item.id, label: item.label, checked: !!checked[item.id] })));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Before you check out">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Confirm each item before checking out.</p>
          <div className="space-y-2">
            {items.map((item) => (
              <label
                key={item.id}
                className="flex cursor-pointer items-start gap-2 rounded-xl border border-border px-3 py-2.5 text-sm hover:border-primary/40"
              >
                <input
                  type="checkbox"
                  checked={!!checked[item.id]}
                  onChange={() => toggle(item.id)}
                  className="mt-0.5"
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
          <Button onClick={handleConfirm} disabled={!allChecked || submitting} className="w-full" variant="danger">
            {submitting ? "Checking out..." : "Confirm Checkout"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
