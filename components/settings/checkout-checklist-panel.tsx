"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
import { inputClass } from "@/components/shared/form-field";

type ChecklistItem = { id: string; label: string };

export function CheckoutChecklistPanel({ items: initial }: { items: ChecklistItem[] }) {
  const [items, setItems] = useState(initial);
  const [newLabel, setNewLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    setSubmitting(true);
    const res = await fetch("/api/checklist-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newLabel.trim() }),
    });
    setSubmitting(false);
    if (res.ok) {
      const data = await res.json();
      setItems((prev) => [...prev, data.item]);
      setNewLabel("");
    } else {
      toast.error("Could not add checklist item");
    }
  }

  function startEdit(item: ChecklistItem) {
    setEditingId(item.id);
    setEditValue(item.label);
  }

  async function saveEdit(id: string) {
    const label = editValue.trim();
    if (!label) return;
    const res = await fetch(`/api/checklist-items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    if (res.ok) {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, label } : i)));
      setEditingId(null);
      toast.success("Checklist item updated");
    } else {
      toast.error("Could not update checklist item");
    }
  }

  async function removeItem(id: string) {
    if (!confirm("Delete this checklist item? Employees will no longer see it at checkout.")) return;
    const res = await fetch(`/api/checklist-items/${id}`, { method: "DELETE" });
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.id !== id));
      toast.success("Checklist item deleted");
    } else {
      toast.error("Could not delete checklist item");
    }
  }

  return (
    <div className="space-y-2">
      {items.length === 0 && (
        <p className="text-sm text-muted-foreground">No checklist items yet. Add one below.</p>
      )}
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between gap-2 rounded-xl border border-border px-5 py-2.5 text-sm"
        >
          {editingId === item.id ? (
            <>
              <input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className={inputClass}
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && saveEdit(item.id)}
              />
              <div className="flex shrink-0 items-center gap-1">
                <IconTooltip label="Save">
                  <button
                    onClick={() => saveEdit(item.id)}
                    aria-label="Save"
                    className="rounded-lg p-1.5 text-success hover:bg-success/10"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                </IconTooltip>
                <IconTooltip label="Cancel">
                  <button
                    onClick={() => setEditingId(null)}
                    aria-label="Cancel"
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/60"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </IconTooltip>
              </div>
            </>
          ) : (
            <>
              <span>{item.label}</span>
              <div className="flex shrink-0 items-center gap-1">
                <IconTooltip label="Edit">
                  <button
                    onClick={() => startEdit(item)}
                    aria-label="Edit checklist item"
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/60 hover:text-primary"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </IconTooltip>
                <IconTooltip label="Delete">
                  <button
                    onClick={() => removeItem(item.id)}
                    aria-label="Delete checklist item"
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </IconTooltip>
              </div>
            </>
          )}
        </div>
      ))}

      <form onSubmit={addItem} className="flex items-center gap-2">
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          className={inputClass}
          placeholder="e.g. Handover notes updated"
        />
        <Button type="submit" variant="secondary" size="sm" disabled={submitting || !newLabel.trim()}>
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </form>
    </div>
  );
}
