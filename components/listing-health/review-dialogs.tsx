"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Field, inputClass } from "@/components/shared/form-field";

type ImportResult = {
  imported: number;
  duplicates: number;
  skippedCount: number;
  skipped: { line: number; reason: string }[];
  unmatchedCount: number;
  unmatched: { line: number; ref: string | null }[];
};

/**
 * Import reviews from a CSV (Guesty / PMS export, or a sheet). With a
 * propertyId every row goes to that listing; without one, a listing column
 * (Airbnb ID, URL or name) decides where each row belongs.
 */
export function ImportReviewsDialog({
  open,
  onOpenChange,
  clientId,
  propertyId,
  listingLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  propertyId?: string;
  listingLabel?: string;
}) {
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 5_000_000) {
      toast.error("That file is larger than 5 MB.");
      return;
    }
    setFileName(file.name);
    setCsv(await file.text());
    setResult(null);
  }

  async function submit() {
    setBusy(true);
    const res = await fetch("/api/listing-health/reviews/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, propertyId: propertyId ?? null, csv }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Import failed");
      return;
    }
    setResult(data);
    toast.success(`${data.imported} review${data.imported === 1 ? "" : "s"} imported`);
    router.refresh();
  }

  function close(next: boolean) {
    if (!next) {
      setCsv("");
      setFileName(null);
      setResult(null);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent title={listingLabel ? `Import reviews · ${listingLabel}` : "Import reviews"} className="max-w-lg">
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Upload a CSV export of reviews (Guesty, Hostaway, Hospitable or your own sheet). It needs a <b>rating</b> column and a{" "}
            <b>review</b> column; date, guest name and private feedback are picked up when present.
            {!propertyId && (
              <>
                {" "}
                For the whole client, include a <b>listing</b> column (Airbnb ID, listing URL or the listing name).
              </>
            )}{" "}
            Re-importing the same file never creates duplicates.
          </p>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center transition hover:border-primary/40">
            <Upload className="h-5 w-5 text-muted-foreground" />
            <span>{fileName ?? "Choose a .csv file"}</span>
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          {result && (
            <div className="space-y-1 rounded-xl border border-border bg-muted/20 p-3 text-xs">
              <p>
                <b>{result.imported}</b> imported · {result.duplicates} already saved · {result.skippedCount} skipped · {result.unmatchedCount} not matched to a listing
              </p>
              {result.skipped.slice(0, 5).map((s) => (
                <p key={`s${s.line}`} className="text-muted-foreground">
                  Row {s.line}: {s.reason}
                </p>
              ))}
              {result.unmatched.slice(0, 5).map((u) => (
                <p key={`u${u.line}`} className="text-muted-foreground">
                  Row {u.line}: no listing matches “{u.ref ?? "(blank)"}”
                </p>
              ))}
            </div>
          )}
          <Button className="w-full" disabled={!csv || busy} onClick={submit}>
            {busy ? "Importing…" : "Import reviews"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Add one review by hand (e.g. copied from the Airbnb host dashboard). */
export function AddReviewDialog({ open, onOpenChange, propertyId }: { open: boolean; onOpenChange: (open: boolean) => void; propertyId: string }) {
  const router = useRouter();
  const [rating, setRating] = useState("3");
  const [comment, setComment] = useState("");
  const [privateNote, setPrivateNote] = useState("");
  const [guestName, setGuestName] = useState("");
  const [reviewDate, setReviewDate] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/listing-health/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        propertyId,
        rating: Number(rating),
        comment,
        privateNote: privateNote || null,
        guestName: guestName || null,
        reviewDate: reviewDate || null,
      }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Could not save the review");
      return;
    }
    toast.success("Review saved");
    setComment("");
    setPrivateNote("");
    setGuestName("");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add a review" className="max-w-md">
        <form onSubmit={submit} className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Stars">
            <Select value={rating} onValueChange={setRating} options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} star${n === 1 ? "" : "s"}` }))} />
          </Field>
          <Field label="Date">
            <input type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Guest" className="col-span-2">
            <input value={guestName} onChange={(e) => setGuestName(e.target.value)} className={inputClass} placeholder="Optional" />
          </Field>
          <Field label="Public review" className="col-span-2">
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={4} required minLength={2} className={inputClass} placeholder="Paste the guest's review" />
          </Field>
          <Field label="Private feedback" className="col-span-2">
            <textarea value={privateNote} onChange={(e) => setPrivateNote(e.target.value)} rows={2} className={inputClass} placeholder="Optional — what they told you privately" />
          </Field>
          <Button type="submit" disabled={busy} className="col-span-2">
            {busy ? "Saving…" : "Save review"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
