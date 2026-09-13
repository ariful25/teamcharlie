"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Download, FileSpreadsheet, Pencil, Plus, RefreshCcw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Field, inputClass } from "@/components/shared/form-field";

type ClientOption = { id: string; name: string };
type KnowledgeItem = any;

const STATUS_OPTIONS = [
  { value: "PENDING", label: "Pending" },
  { value: "EXTRACTING", label: "Extracting" },
  { value: "NEEDS_REVIEW", label: "Needs Review" },
  { value: "READY", label: "Ready" },
  { value: "EXPORTED", label: "Exported" },
  { value: "FAILED", label: "Failed" },
];

function text(form: FormData, key: string) {
  const value = String(form.get(key) ?? "").trim();
  return value || null;
}

function numberOrNull(form: FormData, key: string) {
  const value = text(form, key);
  return value == null ? null : Number(value);
}

function amenitiesToText(amenities?: string[]) {
  return Array.isArray(amenities) ? amenities.join("\n") : "";
}

function parseAmenities(value: string | null) {
  return (value ?? "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function submitJson(url: string, method: string, payload?: Record<string, any>) {
  const res = await fetch(url, {
    method,
    headers: payload ? { "Content-Type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Request failed");
  }
  return res.json().catch(() => ({}));
}

function PropertyFormModal({
  clients,
  existing,
  defaultClientId,
}: {
  clients: ClientOption[];
  existing?: KnowledgeItem;
  defaultClientId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [clientId, setClientId] = useState(existing?.clientId ?? defaultClientId ?? clients[0]?.id ?? "");
  const [status, setStatus] = useState(existing?.status ?? "PENDING");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const payload = {
      clientId,
      internalName: text(form, "internalName"),
      airbnbUrl: text(form, "airbnbUrl"),
      status,
      listingName: text(form, "listingName"),
      description: text(form, "description"),
      amenities: parseAmenities(text(form, "amenities")),
      propertyType: text(form, "propertyType"),
      location: text(form, "location"),
      guestCapacity: numberOrNull(form, "guestCapacity"),
      bedrooms: numberOrNull(form, "bedrooms"),
      bathrooms: numberOrNull(form, "bathrooms"),
      beds: numberOrNull(form, "beds"),
      rules: text(form, "rules"),
      wifiName: text(form, "wifiName"),
      wifiPassword: text(form, "wifiPassword"),
      doorCode: text(form, "doorCode"),
      parkingInfo: text(form, "parkingInfo"),
      checkInInfo: text(form, "checkInInfo"),
      checkoutInfo: text(form, "checkoutInfo"),
      internalNotes: text(form, "internalNotes"),
    };

    try {
      await submitJson(existing ? `/api/knowledge-properties/${existing.id}` : "/api/knowledge-properties", existing ? "PATCH" : "POST", payload);
      toast.success("Property saved");
      setOpen(false);
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message);
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {existing ? (
          <button className="rounded-lg p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary" aria-label="Edit property">
            <Pencil className="h-4 w-4" />
          </button>
        ) : (
          <Button>
            <Plus className="h-4 w-4" /> Add Property
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={existing ? "Review Property Knowledge" : "Add Property"} className="max-w-3xl">
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
          <Field label="Client">
            <Select value={clientId} onValueChange={setClientId} options={clients.map((client) => ({ value: client.id, label: client.name }))} />
          </Field>
          <Field label="Status">
            <Select value={status} onValueChange={setStatus} options={STATUS_OPTIONS} />
          </Field>
          <Field label="Internal Property Name">
            <input name="internalName" required defaultValue={existing?.internalName ?? ""} className={inputClass} />
          </Field>
          <Field label="Airbnb URL">
            <input name="airbnbUrl" required type="url" defaultValue={existing?.airbnbUrl ?? ""} className={inputClass} />
          </Field>

          <div className="col-span-2 mt-2 border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Airbnb Information</p>
          </div>
          <Field label="Listing Name" className="col-span-2">
            <input name="listingName" defaultValue={existing?.listingName ?? ""} className={inputClass} />
          </Field>
          <Field label="Description" className="col-span-2">
            <textarea name="description" rows={4} defaultValue={existing?.description ?? ""} className={inputClass} />
          </Field>
          <Field label="Amenities" className="col-span-2">
            <textarea name="amenities" rows={4} defaultValue={amenitiesToText(existing?.amenities)} className={inputClass} placeholder="One per line or comma-separated" />
          </Field>
          <Field label="Property Type">
            <input name="propertyType" defaultValue={existing?.propertyType ?? ""} className={inputClass} />
          </Field>
          <Field label="Location">
            <input name="location" defaultValue={existing?.location ?? ""} className={inputClass} />
          </Field>
          <Field label="Guests">
            <input name="guestCapacity" type="number" min="0" defaultValue={existing?.guestCapacity ?? ""} className={inputClass} />
          </Field>
          <Field label="Bedrooms">
            <input name="bedrooms" type="number" min="0" step="0.5" defaultValue={existing?.bedrooms ?? ""} className={inputClass} />
          </Field>
          <Field label="Bathrooms">
            <input name="bathrooms" type="number" min="0" step="0.5" defaultValue={existing?.bathrooms ?? ""} className={inputClass} />
          </Field>
          <Field label="Beds">
            <input name="beds" type="number" min="0" step="0.5" defaultValue={existing?.beds ?? ""} className={inputClass} />
          </Field>
          <Field label="Rules" className="col-span-2">
            <textarea name="rules" rows={3} defaultValue={existing?.rules ?? ""} className={inputClass} />
          </Field>

          <div className="col-span-2 mt-2 border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Operational Information</p>
          </div>
          <Field label="WiFi Name">
            <input name="wifiName" defaultValue={existing?.wifiName ?? ""} className={inputClass} />
          </Field>
          <Field label="WiFi Password">
            <input name="wifiPassword" defaultValue={existing?.wifiPassword ?? ""} className={inputClass} />
          </Field>
          <Field label="Door Code">
            <input name="doorCode" defaultValue={existing?.doorCode ?? ""} className={inputClass} />
          </Field>
          <Field label="Parking">
            <input name="parkingInfo" defaultValue={existing?.parkingInfo ?? ""} className={inputClass} />
          </Field>
          <Field label="Check-in" className="col-span-2">
            <textarea name="checkInInfo" rows={3} defaultValue={existing?.checkInInfo ?? ""} className={inputClass} />
          </Field>
          <Field label="Checkout" className="col-span-2">
            <textarea name="checkoutInfo" rows={3} defaultValue={existing?.checkoutInfo ?? ""} className={inputClass} />
          </Field>
          <Field label="Internal Notes" className="col-span-2">
            <textarea name="internalNotes" rows={3} defaultValue={existing?.internalNotes ?? ""} className={inputClass} />
          </Field>

          <Button type="submit" disabled={submitting} className="col-span-2">
            {submitting ? "Saving..." : "Save"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BulkImportModal({ clients, defaultClientId }: { clients: ClientOption[]; defaultClientId?: string }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [clientId, setClientId] = useState(defaultClientId ?? clients[0]?.id ?? "");
  const [csvText, setCsvText] = useState("Internal Property Name,Airbnb URL\n");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await submitJson("/api/knowledge-properties/bulk-import", "POST", { clientId, csvText });
      toast.success(`Imported ${result.imported} properties${result.skipped ? `, skipped ${result.skipped}` : ""}`);
      setOpen(false);
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message);
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="h-4 w-4" /> Bulk Import
        </Button>
      </DialogTrigger>
      <DialogContent title="Bulk Import Properties" className="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Client">
            <Select value={clientId} onValueChange={setClientId} options={clients.map((client) => ({ value: client.id, label: client.name }))} />
          </Field>
          <Field label="CSV Rows">
            <textarea
              value={csvText}
              onChange={(event) => setCsvText(event.target.value)}
              rows={12}
              className={inputClass}
              placeholder="Internal Property Name, Airbnb URL"
            />
          </Field>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Importing..." : "Import Properties"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RowActions({ item, clients, canManage }: { item: KnowledgeItem; clients: ClientOption[]; canManage: boolean }) {
  const [pending, startTransition] = useTransition();

  function runExtract() {
    startTransition(async () => {
      try {
        await submitJson(`/api/knowledge-properties/${item.id}/extract`, "POST");
        toast.success("Extraction complete. Review the fields before export.");
        window.location.reload();
      } catch (err: any) {
        toast.error(err.message);
        window.location.reload();
      }
    });
  }

  function remove() {
    if (!confirm(`Delete ${item.internalName}?`)) return;
    startTransition(async () => {
      try {
        await submitJson(`/api/knowledge-properties/${item.id}`, "DELETE");
        toast.success("Property removed");
        window.location.reload();
      } catch (err: any) {
        toast.error(err.message);
      }
    });
  }

  if (!canManage) return null;

  return (
    <div className="flex justify-end gap-1">
      <button disabled={pending} onClick={runExtract} className="rounded-lg p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary" aria-label="Extract Airbnb info">
        <RefreshCcw className="h-4 w-4" />
      </button>
      <PropertyFormModal clients={clients} existing={item} />
      <button disabled={pending} onClick={remove} className="rounded-lg p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger" aria-label="Delete property">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

export function KnowledgeBaseManager({
  clients,
  items,
  canManage,
  initialClientId,
}: {
  clients: ClientOption[];
  items: KnowledgeItem[];
  canManage: boolean;
  initialClientId?: string;
}) {
  const [clientId, setClientId] = useState(initialClientId ?? "");
  const filteredItems = useMemo(() => (clientId ? items.filter((item) => item.clientId === clientId) : items), [clientId, items]);
  const readyCount = filteredItems.filter((item) => item.status === "READY" || item.status === "EXPORTED").length;
  const needsReviewCount = filteredItems.filter((item) => item.status === "NEEDS_REVIEW" || item.status === "FAILED").length;
  const exportHref = `/api/knowledge-properties/export${clientId ? `?clientId=${clientId}` : ""}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Property Knowledge Base</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Prepare Airbnb listing information for Google Sheets and NotebookLM. Charlie HQ extracts the repetitive public details; the team reviews and fills operational notes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && <BulkImportModal clients={clients} defaultClientId={clientId || undefined} />}
          {canManage && <PropertyFormModal clients={clients} defaultClientId={clientId || undefined} />}
          <a
            href={exportHref}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-medium transition hover:bg-muted/40"
          >
            <Download className="h-4 w-4" /> Export CSV
          </a>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Properties</p><p className="mt-1 text-2xl font-semibold">{filteredItems.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Ready / Exported</p><p className="mt-1 text-2xl font-semibold">{readyCount}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Needs Review</p><p className="mt-1 text-2xl font-semibold">{needsReviewCount}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Average Completion</p><p className="mt-1 text-2xl font-semibold">{filteredItems.length ? Math.round(filteredItems.reduce((sum, item) => sum + item.completionPct, 0) / filteredItems.length) : 0}%</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Prepared Properties</CardTitle>
          <div className="w-64 max-w-full">
            <Select
              value={clientId}
              onValueChange={setClientId}
              placeholder="All clients"
              options={[{ value: "", label: "All clients" }, ...clients.map((client) => ({ value: client.id, label: client.name }))]}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center">
              <FileSpreadsheet className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">No property knowledge rows yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Bulk import Airbnb URLs to start preparing a Google Sheet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 font-medium">Property</th>
                    <th className="px-5 py-3 font-medium">Client</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Completion</th>
                    <th className="px-5 py-3 font-medium">Knowledge Sheet</th>
                    <th className="px-5 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.id} className="border-b border-border/60 last:border-0">
                      <td className="px-5 py-3">
                        <p className="font-medium">{item.internalName}</p>
                        <Link href={item.airbnbUrl} target="_blank" className="text-xs text-primary hover:underline">
                          {item.airbnbListingId ? `Airbnb ${item.airbnbListingId}` : item.airbnbUrl}
                        </Link>
                        {item.extractionError && <p className="mt-1 text-xs text-danger">{item.extractionError}</p>}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{item.client?.name}</td>
                      <td className="px-5 py-3"><Badge tone={statusTone(item.status)}>{item.status.replace(/_/g, " ")}</Badge></td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-28 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${item.completionPct}%` }} />
                          </div>
                          <span className="text-xs tabular-nums text-muted-foreground">{item.completionPct}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">
                        {item.listingName ?? "Not extracted yet"}
                      </td>
                      <td className="px-5 py-3"><RowActions item={item} clients={clients} canManage={canManage} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
