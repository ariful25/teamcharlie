"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogTrigger, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Field, inputClass } from "@/components/shared/form-field";

export function IssueFormModal({ clients }: { clients: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [severity, setSeverity] = useState("MEDIUM");
  const [description, setDescription] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const payload = { title, description, clientId: clientId || null, severity };
    const res = await fetch("/api/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSubmitting(false);
    if (res.ok) {
      toast.success("Issue reported");
      setOpen(false);
      window.location.reload();
    } else {
      toast.error("Could not report issue");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> Report Issue
        </Button>
      </DialogTrigger>
      <DialogContent title="Report Issue">
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} required className={inputClass} placeholder="Short summary" />
          </Field>
          <Field label="Client">
            <Select
              value={clientId}
              onValueChange={setClientId}
              placeholder="General / Internal"
              options={[{ value: "", label: "General / Internal" }, ...clients.map((c) => ({ value: c.id, label: c.name }))]}
            />
          </Field>
          <Field label="Severity">
            <Select
              value={severity}
              onValueChange={setSeverity}
              options={[
                { value: "LOW", label: "Low", dotColor: "#94a3b8" },
                { value: "MEDIUM", label: "Medium", dotColor: "#facc15" },
                { value: "HIGH", label: "High", dotColor: "#fb923c" },
                { value: "CRITICAL", label: "Critical", dotColor: "#f87171" },
              ]}
            />
          </Field>
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className={inputClass}
              placeholder="What's happening..."
            />
          </Field>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Submitting..." : "Report Issue"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
