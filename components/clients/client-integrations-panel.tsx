"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleDashed, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge, Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Field, inputClass } from "@/components/shared/form-field";

type IntegrationRow = {
  provider: string;
  label: string;
  hasConnector: boolean;
  record: {
    id: string;
    status: "NOT_CONNECTED" | "NEEDS_AUTHORIZATION" | "CONNECTED" | "ERROR";
    note: string | null;
    connectedAt: string | null;
    lastCheckedAt: string | null;
    lastError: string | null;
  } | null;
};

const STATUS_META: Record<string, { label: string; tone: Tone; icon: typeof CheckCircle2 }> = {
  CONNECTED: { label: "Externally Configured", tone: "success", icon: CheckCircle2 },
  NEEDS_AUTHORIZATION: { label: "Needs Authorization", tone: "warning", icon: AlertCircle },
  ERROR: { label: "Error", tone: "danger", icon: AlertCircle },
  NOT_CONNECTED: { label: "Not Connected", tone: "neutral", icon: CircleDashed },
};

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

function ConfigureModal({ clientId, row }: { clientId: string; row: IntegrationRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string>(row.record?.status ?? "NOT_CONNECTED");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const note = String(form.get("note") ?? "").trim() || null;
    try {
      await submitJson(`/api/clients/${clientId}/integrations/${row.provider}`, "PATCH", { status, note });
      toast.success(`${row.label} updated`);
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
        <Button variant="outline" className="h-8 px-3 text-xs">
          {row.record ? "Update" : "Connect"}
        </Button>
      </DialogTrigger>
      <DialogContent title={`${row.label} — Connection Status`} className="max-w-md">
        <form onSubmit={handleSubmit} className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {row.hasConnector
              ? "Set this once the connection is set up."
              : `Charlie HQ has no automated ${row.label} connector yet — this only records the status for team visibility, it does not give Charlie HQ access. Set it up directly in ${row.label}, then mark it "Externally Configured" here.`}
          </p>
          <Field label="Status">
            <Select
              value={status}
              onValueChange={setStatus}
              options={[
                { value: "NOT_CONNECTED", label: "Not Connected" },
                { value: "NEEDS_AUTHORIZATION", label: "Needs Authorization" },
                { value: "CONNECTED", label: "Externally Configured" },
                { value: "ERROR", label: "Error" },
              ]}
            />
          </Field>
          <Field label="Note (optional)">
            <input name="note" defaultValue={row.record?.note ?? ""} className={inputClass} placeholder="e.g. account email, workspace name" />
          </Field>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Saving..." : "Save"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function IntegrationRowItem({ clientId, row, canManage }: { clientId: string; row: IntegrationRow; canManage: boolean }) {
  const [testing, setTesting] = useState(false);
  const status = row.record?.status ?? "NOT_CONNECTED";
  const meta = STATUS_META[status];
  const Icon = meta.icon;

  async function testConnection() {
    setTesting(true);
    try {
      const result = await submitJson(`/api/clients/${clientId}/integrations/${row.provider}/test`, "POST");
      toast[result.ok ? "success" : "info"](result.message);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 border-t border-border/60 px-5 py-3 text-sm first:border-0">
      <div className="min-w-0">
        <p className="font-medium">{row.label}</p>
        {row.record?.note && <p className="truncate text-xs text-muted-foreground">{row.record.note}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge tone={meta.tone}>
          <Icon className="h-3 w-3" /> {meta.label}
        </Badge>
        {canManage && row.record && (
          <button
            disabled={testing}
            onClick={testConnection}
            className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground transition hover:bg-muted/40 disabled:opacity-50"
          >
            {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : "Test Connection"}
          </button>
        )}
        {canManage && <ConfigureModal clientId={clientId} row={row} />}
      </div>
    </div>
  );
}

export function ClientIntegrationsPanel({
  clientId,
  integrations,
  canManage,
}: {
  clientId: string;
  integrations: IntegrationRow[];
  canManage: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Integrations</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {integrations.map((row) => (
          <IntegrationRowItem key={row.provider} clientId={clientId} row={row} canManage={canManage} />
        ))}
      </CardContent>
    </Card>
  );
}
