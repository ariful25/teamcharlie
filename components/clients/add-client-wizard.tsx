"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Field, inputClass } from "@/components/shared/form-field";
import { INTEGRATION_LABELS } from "@/lib/validations";

const STATUS_OPTIONS = [
  { value: "STABLE", label: "Stable" },
  { value: "ATTENTION", label: "Attention" },
  { value: "URGENT", label: "Urgent" },
  { value: "WAITING", label: "Waiting" },
];

// Every generic Charlie HQ module is always enabled for every client — this
// is display-only, showing what the wizard's spec calls "Step 4: Modules".
// There's deliberately no toggle here: making these opt-out per client
// would need a feature-flag system nothing else in the app has, for
// modules that are supposed to just always work.
const ALWAYS_ON_MODULES = ["Tasks", "Recurring Tasks", "Issues", "Property Knowledge Base", "Properties", "Leads", "Files"];

const PROVIDERS = Object.keys(INTEGRATION_LABELS) as (keyof typeof INTEGRATION_LABELS)[];

const STEPS = ["Client", "Platforms", "Integrations", "Modules", "Review"] as const;

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

export function AddClientWizard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [status, setStatus] = useState("STABLE");
  const [notes, setNotes] = useState("");
  const [guestCommunicationPlatform, setGuestCommunicationPlatform] = useState("");
  const [operationPlatform, setOperationPlatform] = useState("");
  const [clientCommunicationPlatform, setClientCommunicationPlatform] = useState("");
  const [selectedIntegrations, setSelectedIntegrations] = useState<Set<string>>(new Set());

  function reset() {
    setStep(0);
    setName("");
    setStatus("STABLE");
    setNotes("");
    setGuestCommunicationPlatform("");
    setOperationPlatform("");
    setClientCommunicationPlatform("");
    setSelectedIntegrations(new Set());
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    setOpen(next);
  }

  function toggleIntegration(provider: string) {
    setSelectedIntegrations((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) next.delete(provider);
      else next.add(provider);
      return next;
    });
  }

  async function handleCreate() {
    if (!name.trim()) {
      setStep(0);
      toast.error("Client name is required");
      return;
    }
    setSubmitting(true);
    try {
      const { client } = await submitJson("/api/clients", "POST", {
        name: name.trim(),
        status,
        notes: notes.trim() || null,
        guestCommunicationPlatform: guestCommunicationPlatform.trim() || null,
        operationPlatform: operationPlatform.trim() || null,
        clientCommunicationPlatform: clientCommunicationPlatform.trim() || null,
        integrations: Array.from(selectedIntegrations),
      });
      toast.success(`${client.name} created`);
      handleOpenChange(false);
      router.push(`/clients/${client.id}`);
    } catch (err: any) {
      toast.error(err.message);
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> Add Client
        </Button>
      </DialogTrigger>
      <DialogContent title="Add Client" className="max-w-xl">
        <div className="mb-4 flex items-center gap-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium ${
                  i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                }`}
              >
                {i < step ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && <div className={`h-px w-4 ${i < step ? "bg-primary/40" : "bg-border"}`} />}
            </div>
          ))}
        </div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Step {step + 1} of {STEPS.length} — {STEPS[step]}
        </p>

        {step === 0 && (
          <div className="space-y-3">
            <Field label="Client Name">
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. District One" autoFocus />
            </Field>
            <Field label="Status">
              <Select value={status} onValueChange={setStatus} options={STATUS_OPTIONS} />
            </Field>
            <Field label="Notes">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputClass} />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <Field label="Guest Communication Platform">
              <input value={guestCommunicationPlatform} onChange={(e) => setGuestCommunicationPlatform(e.target.value)} className={inputClass} placeholder="e.g. WhatsApp" />
            </Field>
            <Field label="Operations Platform">
              <input value={operationPlatform} onChange={(e) => setOperationPlatform(e.target.value)} className={inputClass} placeholder="e.g. ClickUp" />
            </Field>
            <Field label="Client Communication Platform">
              <input value={clientCommunicationPlatform} onChange={(e) => setClientCommunicationPlatform(e.target.value)} className={inputClass} placeholder="e.g. Email" />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Selecting a provider only enables it for this client (status starts Not Connected) — it does not connect any account. You can enable more, or connect, later from the client workspace.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {PROVIDERS.map((provider) => (
                <label
                  key={provider}
                  className="flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm hover:bg-muted/40"
                >
                  <input
                    type="checkbox"
                    checked={selectedIntegrations.has(provider)}
                    onChange={() => toggleIntegration(provider)}
                    className="h-4 w-4 rounded border-border"
                  />
                  {INTEGRATION_LABELS[provider]}
                </label>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Every client automatically gets these Charlie HQ modules — nothing to configure.</p>
            <div className="grid grid-cols-2 gap-2">
              {ALWAYS_ON_MODULES.map((mod) => (
                <div key={mod} className="flex items-center gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-success" /> {mod}
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Client</p>
              <p className="mt-1 font-medium">{name || "—"}</p>
              <p className="text-xs text-muted-foreground">{STATUS_OPTIONS.find((o) => o.value === status)?.label}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Modules</p>
              <p className="mt-1 text-xs text-muted-foreground">{ALWAYS_ON_MODULES.join(", ")} — all enabled</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Integrations</p>
              {selectedIntegrations.size === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">None selected — can be added later.</p>
              ) : (
                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {Array.from(selectedIntegrations).map((p) => (
                    <li key={p}>
                      {INTEGRATION_LABELS[p as keyof typeof INTEGRATION_LABELS]} — Needs connection
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <div className="mt-5 flex justify-between">
          <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))} disabled={step === 0 && !name.trim()}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting ? "Creating..." : "Create Client"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
