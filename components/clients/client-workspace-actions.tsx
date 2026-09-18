"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Power, PowerOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Field, inputClass } from "@/components/shared/form-field";

type Client = {
  id: string;
  name: string;
  status: string;
  guestCommunicationPlatform: string | null;
  operationPlatform: string | null;
  clientCommunicationPlatform: string | null;
  notes: string | null;
  active: boolean;
};

const STATUS_OPTIONS = [
  { value: "STABLE", label: "Stable" },
  { value: "ATTENTION", label: "Attention" },
  { value: "URGENT", label: "Urgent" },
  { value: "WAITING", label: "Waiting" },
];

async function submitJson(url: string, method: string, payload?: Record<string, any>) {
  const res = await fetch(url, {
    method,
    headers: payload ? { "Content-Type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

function EditClientModal({ client }: { client: Client }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(client.status);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? "").trim() || null;
    try {
      await submitJson(`/api/clients/${client.id}`, "PATCH", {
        name: text("name"),
        status,
        guestCommunicationPlatform: text("guestCommunicationPlatform"),
        operationPlatform: text("operationPlatform"),
        clientCommunicationPlatform: text("clientCommunicationPlatform"),
        notes: text("notes"),
      });
      toast.success("Client updated");
      setOpen(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Pencil className="h-4 w-4" /> Edit Client
        </Button>
      </DialogTrigger>
      <DialogContent title="Edit Client" className="max-w-lg">
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
          <Field label="Client Name" className="col-span-2">
            <input name="name" required defaultValue={client.name} className={inputClass} />
          </Field>
          <Field label="Status">
            <Select value={status} onValueChange={setStatus} options={STATUS_OPTIONS} />
          </Field>
          <Field label="Guest Communication Platform">
            <input name="guestCommunicationPlatform" defaultValue={client.guestCommunicationPlatform ?? ""} className={inputClass} />
          </Field>
          <Field label="Operations Platform">
            <input name="operationPlatform" defaultValue={client.operationPlatform ?? ""} className={inputClass} />
          </Field>
          <Field label="Client Communication Platform">
            <input name="clientCommunicationPlatform" defaultValue={client.clientCommunicationPlatform ?? ""} className={inputClass} />
          </Field>
          <Field label="Notes" className="col-span-2">
            <textarea name="notes" rows={3} defaultValue={client.notes ?? ""} className={inputClass} />
          </Field>
          <Button type="submit" disabled={submitting} className="col-span-2">
            {submitting ? "Saving..." : "Save"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeactivateButton({ client }: { client: Client }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const verb = client.active ? "deactivate" : "reactivate";
    if (!confirm(`${verb === "deactivate" ? "Deactivate" : "Reactivate"} ${client.name}? ${verb === "deactivate" ? "Historical tasks, issues, properties, files, and knowledge base entries are kept — the client just disappears from active dropdowns." : ""}`)) {
      return;
    }
    setBusy(true);
    try {
      await submitJson(`/api/clients/${client.id}`, "PATCH", { active: !client.active });
      toast.success(`Client ${verb}d`);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" onClick={toggle} disabled={busy}>
      {client.active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
      {client.active ? "Deactivate" : "Reactivate"}
    </Button>
  );
}

export function ClientWorkspaceActions({ client }: { client: Client }) {
  return (
    <div className="flex flex-wrap gap-2">
      <EditClientModal client={client} />
      <DeactivateButton client={client} />
    </div>
  );
}
