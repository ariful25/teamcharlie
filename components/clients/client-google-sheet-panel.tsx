"use client";

import { useState } from "react";
import { CheckCircle2, CircleDashed, AlertCircle, Loader2, ExternalLink, RefreshCw, History } from "lucide-react";
import { toast } from "sonner";
import { Badge, Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";

type GoogleSheet = {
  spreadsheetId: string | null;
  spreadsheetUrl: string | null;
  status: "NOT_CONNECTED" | "CREATING" | "CONNECTED" | "ERROR";
  lastSyncedAt: string | null;
  lastSyncError: string | null;
} | null;

type SyncLogEntry = {
  id: string;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  source: string;
  message: string | null;
  createdAt: string;
  property: { internalName: string } | null;
};

const STATUS_META: Record<string, { label: string; tone: Tone; icon: typeof CheckCircle2 }> = {
  CONNECTED: { label: "Connected", tone: "success", icon: CheckCircle2 },
  CREATING: { label: "Creating...", tone: "warning", icon: Loader2 },
  ERROR: { label: "Error", tone: "danger", icon: AlertCircle },
  NOT_CONNECTED: { label: "Not Connected", tone: "neutral", icon: CircleDashed },
};

async function submitJson(url: string, method: string) {
  const res = await fetch(url, { method });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

function SyncLogModal({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<SyncLogEntry[]>([]);

  async function handleOpen(next: boolean) {
    setOpen(next);
    if (!next) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/google-sheet/log`);
      const data = await res.json();
      setLogs(data.logs ?? []);
    } catch {
      toast.error("Could not load sync log");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <Button variant="outline" className="h-8 px-3 text-xs" onClick={() => handleOpen(true)}>
        <History className="h-3.5 w-3.5" /> View Sync Log
      </Button>
      <DialogContent title="Google Sheets Sync Log" className="max-w-2xl">
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading...</p>
        ) : logs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No sync activity yet.</p>
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {logs.map((log) => (
              <div key={log.id} className="rounded-xl border border-border px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{log.property?.internalName ?? log.action}</span>
                  <span className="text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</span>
                </div>
                {log.field ? (
                  <p className="mt-1 text-muted-foreground">
                    {log.field}: <span className="line-through">{log.oldValue || "—"}</span> → {log.newValue || "—"}
                  </p>
                ) : (
                  <p className="mt-1 text-muted-foreground">{log.message ?? log.action}</p>
                )}
                <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">{log.source}</p>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ClientGoogleSheetPanel({
  clientId,
  clientName,
  googleSheet,
  propertiesSynced,
  canManage,
}: {
  clientId: string;
  clientName: string;
  googleSheet: GoogleSheet;
  propertiesSynced: number;
  canManage: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const status = googleSheet?.status ?? "NOT_CONNECTED";
  const meta = STATUS_META[status];
  const Icon = meta.icon;

  async function handleCreate() {
    setBusy(true);
    try {
      await submitJson(`/api/clients/${clientId}/google-sheet`, "POST");
      toast.success("Google Spreadsheet created");
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSync() {
    setBusy(true);
    try {
      const result = await submitJson(`/api/clients/${clientId}/google-sheet/sync`, "POST");
      toast.success(`Synced ${result.synced} propert${result.synced === 1 ? "y" : "ies"}${result.errors ? `, ${result.errors} error(s)` : ""}`);
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Google Knowledge Base</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-5 pb-5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Status</span>
          <Badge tone={meta.tone}>
            <Icon className={`h-3 w-3 ${status === "CREATING" ? "animate-spin" : ""}`} /> {meta.label}
          </Badge>
        </div>

        {status === "CONNECTED" && (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Spreadsheet</span>
              <span className="truncate font-medium">{clientName} - Property Knowledge Base</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Spreadsheet ID</span>
              <span className="truncate font-mono text-xs text-muted-foreground">{googleSheet?.spreadsheetId}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Last Sync</span>
              <span>{googleSheet?.lastSyncedAt ? new Date(googleSheet.lastSyncedAt).toLocaleString() : "Never"}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Properties Synced</span>
              <span>{propertiesSynced}</span>
            </div>
          </>
        )}

        {(status === "ERROR" || googleSheet?.lastSyncError) && (
          <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
            Sync Errors: {googleSheet?.lastSyncError}
          </p>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {status === "CONNECTED" && googleSheet?.spreadsheetUrl && (
            <Button
              variant="outline"
              className="h-8 px-3 text-xs"
              onClick={() => window.open(googleSheet.spreadsheetUrl!, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open Spreadsheet
            </Button>
          )}
          {canManage && status === "CONNECTED" && (
            <Button variant="outline" className="h-8 px-3 text-xs" onClick={handleSync} disabled={busy}>
              <RefreshCw className="h-3.5 w-3.5" /> Sync Now
            </Button>
          )}
          {status === "CONNECTED" && <SyncLogModal clientId={clientId} />}
          {canManage && status !== "CONNECTED" && (
            <Button className="h-8 px-3 text-xs" onClick={handleCreate} disabled={busy || status === "CREATING"}>
              {status === "ERROR" ? "Retry Create Spreadsheet" : "Create Google Spreadsheet"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
