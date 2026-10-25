"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/shared/form-field";
import { fillTemplate, policyWarnings } from "@/lib/reviews/templates";
import { cn } from "@/lib/utils";
import type { ReviewHub } from "@/lib/reviews/queries";

/** The guest messages used at each pipeline step, editable by the team. */
export function TemplatesEditor({ templates }: { templates: ReviewHub["templates"] }) {
  return (
    <div className="space-y-5">
      <p className="max-w-[72ch] text-sm text-muted-foreground">
        These fill in the guest&apos;s first name (<code>{"{firstName}"}</code>) and listing (<code>{"{listing}"}</code>). Airbnb&apos;s Reviews Policy
        forbids offering anything for a review, pressuring guests, or trading reviews (&ldquo;our 5★ for yours&rdquo;) — the editor warns when a message
        reads that way.
      </p>
      {templates.map((t) => (
        <TemplateCard key={t.key} t={t} />
      ))}
    </div>
  );
}

function TemplateCard({ t }: { t: ReviewHub["templates"][number] }) {
  const router = useRouter();
  const [body, setBody] = useState(t.body);
  const [busy, setBusy] = useState(false);
  const warnings = policyWarnings(body);
  const dirty = body !== t.body;

  async function save(value: string | null) {
    setBusy(true);
    const res = await fetch("/api/reviews/templates", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: t.key, body: value }) });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.error ?? "Couldn't save");
    toast.success(value === null ? "Restored the default" : "Template saved");
    router.refresh();
  }

  return (
    <section className="glass grid grid-cols-1 gap-5 rounded-2xl p-5 shadow-card lg:grid-cols-golden">
      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-base font-semibold">{t.label}</h3>
          <span className="text-xs text-muted-foreground">{t.when}</span>
        </div>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} className={cn(inputClass, "min-h-[180px] leading-relaxed")} />
        {warnings.map((w) => (
          <p key={w} className="flex items-start gap-2 text-xs text-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}
          </p>
        ))}
        <div className="flex justify-end gap-2">
          {t.custom && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => save(null)}>
              Restore default
            </Button>
          )}
          <Button size="sm" disabled={busy || !dirty || !body.trim()} onClick={() => save(body)}>
            Save
          </Button>
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs text-muted-foreground">Preview</p>
        <p className="whitespace-pre-wrap rounded-xl border border-border bg-background/40 p-3 text-[13px] leading-relaxed">{fillTemplate(body, { firstName: "Sarah", listing: "Jaeger Haus" })}</p>
      </div>
    </section>
  );
}
