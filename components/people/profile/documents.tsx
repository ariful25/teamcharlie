"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLink, FileText, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { IconTooltip } from "@/components/ui/tooltip";
import { DatePicker, formatYmd } from "@/components/ui/date-picker";
import { Field, inputClass } from "@/components/shared/form-field";
import type { ProfileData } from "@/lib/people/queries";
import { useMutate, Section, DialogActions } from "./shared";

export const DOC_KINDS = ["Contract", "ID", "Certificate", "Policy", "Other"];

export function DocumentsTab({ data }: { data: ProfileData }) {
  const { documents, access, person, today } = data;
  const [adding, setAdding] = useState(false);
  const { busy, run } = useMutate();
  const soon = new Date(`${today}T00:00:00Z`).getTime() + 30 * 86_400_000;
  return (
    <Section
      title="Documents"
      action={
        access.addDocuments ? (
          <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" /> Add link
          </Button>
        ) : undefined
      }
    >
      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">Keep contracts, ID copies and certificates in Google Drive and link them here, so they&apos;re one click away.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {documents.map((d) => {
            const expired = d.expiresAt && d.expiresAt < today;
            const expiring = !expired && d.expiresAt && new Date(`${d.expiresAt}T00:00:00Z`).getTime() <= soon;
            return (
              <li key={d.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <FileText className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1.5 truncate text-sm font-medium hover:text-primary">
                    {d.title} <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                  <p className="text-xs text-muted-foreground">
                    {d.kind}
                    {d.expiresAt && (
                      <span className={cn(expired && "text-danger", expiring && "text-warning")}>
                        {" "}· {expired ? "expired" : "expires"} {formatYmd(d.expiresAt)}
                      </span>
                    )}
                  </p>
                </div>
                {d.canDelete && (
                  <IconTooltip label="Remove link">
                    <button
                      aria-label={`Remove ${d.title}`}
                      disabled={busy}
                      onClick={() => confirm(`Remove “${d.title}”? The file itself stays where it is.`) && run(`/api/people/${person.id}/items?type=document&id=${d.id}`, "DELETE", undefined, "Link removed")}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </IconTooltip>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {adding && <DocumentDialog userId={person.id} onClose={() => setAdding(false)} />}
    </Section>
  );
}

export function DocumentDialog({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { busy, run } = useMutate();
  const [f, setF] = useState({ title: "", kind: "Contract", url: "", expiresAt: "" });
  async function save() {
    if (await run(`/api/people/${userId}/items`, "POST", { type: "document", ...f, expiresAt: f.expiresAt || null }, "Link added")) onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Add document link" className="max-w-md">
        <div className="space-y-3">
          <Field label="Title">
            <input className={inputClass} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Employment contract 2026" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type">
              <Select value={f.kind} onValueChange={(v) => setF({ ...f, kind: v })} options={DOC_KINDS.map((k) => ({ value: k, label: k }))} />
            </Field>
            <Field label="Expires (optional)">
              <DatePicker value={f.expiresAt} onChange={(v) => setF({ ...f, expiresAt: v })} />
            </Field>
          </div>
          <Field label="Link">
            <input className={inputClass} value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://drive.google.com/…" />
          </Field>
          <DialogActions busy={busy} onCancel={onClose} onSave={save} label="Add link" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
