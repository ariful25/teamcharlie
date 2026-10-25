"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardPaste, Sparkles } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { inputClass } from "@/components/shared/form-field";
import { cn } from "@/lib/utils";

type Row = {
  include: boolean;
  propertyId: string | null;
  rating: number | null;
  guestName: string | null;
  reviewDate: string | null;
  comment: string;
  privateNote: string | null;
};

const STARS = [5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} ★` }));

/**
 * Paste text copied from Airbnb's Reviews page; the app splits it into
 * reviews (with AI when the team has it connected), shows them for a check,
 * and saves the confirmed ones. Ratings the text doesn't state are left
 * empty for a person to pick — never guessed.
 */
export function PasteReviewsDialog({
  open,
  onOpenChange,
  clientId,
  listings,
  propertyId,
  listingLabel,
  aiReady,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omit to paste across every listing in the team. */
  clientId?: string | null;
  listings: { id: string; name: string }[];
  propertyId?: string;
  listingLabel?: string;
  aiReady: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [useAi, setUseAi] = useState(aiReady);
  const [busy, setBusy] = useState<"read" | "save" | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [method, setMethod] = useState<"ai" | "text">("text");

  function close(next: boolean) {
    if (!next) {
      setText("");
      setRows(null);
    }
    onOpenChange(next);
  }

  async function read() {
    setBusy("read");
    const res = await fetch("/api/listing-health/reviews/paste", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read", clientId: clientId ?? null, propertyId: propertyId ?? null, text, useAi }),
    });
    setBusy(null);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.error ?? "Couldn't read that text");
    if (!data.rows?.length) return toast.error("No reviews found in that text. Copy the whole Reviews page, including guest names and dates.");
    setMethod(data.method);
    setRows(data.rows.map((r: Omit<Row, "include">) => ({ ...r, include: true })));
  }

  const chosen = rows?.filter((r) => r.include) ?? [];
  const missing = chosen.filter((r) => !r.rating || !r.propertyId).length;

  async function save() {
    setBusy("save");
    const res = await fetch("/api/listing-health/reviews/paste", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save",
        clientId: clientId ?? null,
        rows: chosen.map(({ include: _i, ...r }) => r),
      }),
    });
    setBusy(null);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.error ?? "Couldn't save the reviews");
    toast.success(`${data.saved} review${data.saved === 1 ? "" : "s"} saved${data.duplicates ? ` · ${data.duplicates} were already saved` : ""}`);
    router.refresh();
    close(false);
  }

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs!.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent title={listingLabel ? `Paste reviews · ${listingLabel}` : "Paste reviews"} className="max-w-3xl">
        {!rows ? (
          <div className="space-y-3 text-sm">
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>
                On Airbnb, open <b className="text-foreground">Menu → Reviews</b> (or a listing&apos;s reviews).
              </li>
              <li>
                Press <b className="text-foreground">Ctrl+A</b>, then <b className="text-foreground">Ctrl+C</b> to copy the whole page.
              </li>
              <li>Paste it below. Nothing is saved until you check the preview.</li>
            </ol>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste the copied Reviews page here…"
              className={cn(inputClass, "min-h-[220px] font-mono text-xs")}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              {aiReady ? (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
                  <Sparkles className="h-3.5 w-3.5 text-primary" /> Read it with AI (more accurate on messy text)
                </label>
              ) : (
                <span className="text-xs text-muted-foreground">Connect AI in Settings for better reading of messy text.</span>
              )}
              <Button onClick={read} disabled={!text.trim() || !!busy}>
                <ClipboardPaste className="h-4 w-4" /> {busy === "read" ? "Reading…" : "Read reviews"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Found <b className="text-foreground">{rows.length}</b> review{rows.length === 1 ? "" : "s"} ({method === "ai" ? "read with AI" : "read with the built-in reader"}). Check
              each one{missing ? `; ${missing} still need${missing === 1 ? "s" : ""} a ${propertyId ? "" : "listing or "}star rating` : ""}.
            </p>
            {!propertyId && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Listing for all:</span>
                <div className="min-w-[14rem] flex-1">
                  <Select
                    value=""
                    onValueChange={(v) => v && setRows((rs) => rs!.map((r) => ({ ...r, propertyId: v })))}
                    placeholder="Pick one listing for every review"
                    options={listings.map((l) => ({ value: l.id, label: l.name }))}
                    className="h-9"
                  />
                </div>
              </div>
            )}
            <ul className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
              {rows.map((r, i) => (
                <li key={i} className={cn("space-y-2 rounded-xl border border-border p-3", !r.include && "opacity-50")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <input type="checkbox" aria-label="Include this review" checked={r.include} onChange={(e) => update(i, { include: e.target.checked })} />
                    <input
                      value={r.guestName ?? ""}
                      onChange={(e) => update(i, { guestName: e.target.value || null })}
                      placeholder="Guest"
                      aria-label="Guest name"
                      className={cn(inputClass, "h-9 w-36 py-1")}
                    />
                    <div className="w-40">
                      <DatePicker value={r.reviewDate ?? ""} onChange={(v) => update(i, { reviewDate: v || null })} placeholder="Date" className="h-9" />
                    </div>
                    <div className={cn("w-28", r.include && !r.rating && "rounded-xl ring-1 ring-warning")}>
                      <Select value={r.rating ? String(r.rating) : ""} onValueChange={(v) => update(i, { rating: v ? Number(v) : null })} placeholder="Stars" options={STARS} className="h-9" />
                    </div>
                    {!propertyId && (
                      <div className={cn("min-w-[12rem] flex-1", r.include && !r.propertyId && "rounded-xl ring-1 ring-warning")}>
                        <Select value={r.propertyId ?? ""} onValueChange={(v) => update(i, { propertyId: v || null })} placeholder="Which listing?" options={listings.map((l) => ({ value: l.id, label: l.name }))} className="h-9" />
                      </div>
                    )}
                  </div>
                  <textarea value={r.comment} onChange={(e) => update(i, { comment: e.target.value })} aria-label="Review text" className={cn(inputClass, "min-h-[64px]")} />
                  {r.privateNote && <p className="text-xs text-muted-foreground">Private feedback: {r.privateNote}</p>}
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between gap-2 pt-1">
              <Button variant="ghost" onClick={() => setRows(null)} disabled={!!busy}>
                Back to the text
              </Button>
              <Button onClick={save} disabled={!!busy || chosen.length === 0 || missing > 0}>
                {busy === "save" ? "Saving…" : `Save ${chosen.length} review${chosen.length === 1 ? "" : "s"}`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
