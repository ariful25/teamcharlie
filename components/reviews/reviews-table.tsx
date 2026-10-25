"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageSquareReply, Pencil, Search, Star } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { IconTooltip } from "@/components/ui/tooltip";
import { Field, inputClass } from "@/components/shared/form-field";
import { formatYmd } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";
import type { ReviewHub } from "@/lib/reviews/queries";

type Review = ReviewHub["reviews"][number];
const SOURCE: Record<string, string> = { EMAIL: "Email", PASTE: "Pasted", IMPORT: "CSV", MANUAL: "Manual" };

export function ReviewsTable({ reviews }: { reviews: Review[] }) {
  const [stars, setStars] = useState("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Review | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reviews.filter(
      (r) =>
        (stars === "all" || (stars === "low" ? r.rating <= 3 : stars === "respond" ? r.rating < 5 && !r.responded : r.rating === Number(stars))) &&
        (!q || [r.guestName, r.listing, r.comment].some((v) => v?.toLowerCase().includes(q)))
    );
  }, [reviews, stars, query]);

  return (
    <section className="glass rounded-2xl shadow-card">
      <header className="flex flex-col gap-3 border-b border-border/60 px-5 py-3 sm:flex-row sm:items-center">
        <h3 className="text-sm font-semibold">All reviews</h3>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          <label className="relative">
            <span className="sr-only">Search reviews</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Guest, listing or words" className={cn(inputClass, "h-9 w-56 py-1 pl-9")} />
          </label>
          <div className="w-44">
            <Select
              value={stars}
              onValueChange={setStars}
              className="h-9"
              options={[
                { value: "all", label: "All ratings" },
                { value: "respond", label: "Needs a response" },
                { value: "5", label: "5 ★" },
                { value: "4", label: "4 ★" },
                { value: "low", label: "3 ★ and below" },
              ]}
            />
          </div>
        </div>
      </header>
      {filtered.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-muted-foreground">
          {reviews.length === 0 ? "No reviews yet. Paste them from Airbnb or turn on Review email sync in Settings." : "No reviews match these filters."}
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {filtered.map((r) => (
            <li key={r.id} className="grid grid-cols-1 gap-3 px-5 py-4 text-sm sm:grid-cols-[7rem_minmax(0,1fr)_auto]">
              <div>
                <Stars n={r.rating} />
                <p className="mt-1 text-xs text-muted-foreground">{r.reviewDate ? formatYmd(r.reviewDate) : ""}</p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{r.guestName ?? "Guest"}</span> · {r.listing} · {SOURCE[r.source] ?? r.source}
                </p>
                <p className="mt-1 max-w-[72ch] leading-relaxed">{r.comment}</p>
                {r.privateNote && <p className="mt-1 text-xs text-muted-foreground">Private feedback: {r.privateNote}</p>}
              </div>
              <div className="flex items-start gap-1">
                {r.rating < 5 && <RespondedToggle review={r} />}
                <IconTooltip label="Edit review">
                  <button aria-label="Edit review" onClick={() => setEditing(r)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary">
                    <Pencil className="h-4 w-4" />
                  </button>
                </IconTooltip>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && <EditReviewDialog review={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

export function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${n} stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn("h-3.5 w-3.5", i <= n ? (n === 5 ? "fill-success text-success" : n === 4 ? "fill-warning text-warning" : "fill-danger text-danger") : "text-muted-foreground/40")} />
      ))}
    </span>
  );
}

function RespondedToggle({ review }: { review: Review }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    const res = await fetch(`/api/reviews/${review.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ responded: !review.responded }) });
    setBusy(false);
    if (!res.ok) return toast.error("Couldn't update");
    router.refresh();
  }
  return (
    <IconTooltip label={review.responded ? "Public response posted" : "Mark public response posted"}>
      <button
        aria-label={review.responded ? "Public response posted" : "Mark public response posted"}
        aria-pressed={review.responded}
        disabled={busy}
        onClick={toggle}
        className={cn("rounded-lg p-1.5 transition-colors", review.responded ? "text-success hover:bg-success/10" : "text-warning hover:bg-warning/10")}
      >
        <MessageSquareReply className="h-4 w-4" />
      </button>
    </IconTooltip>
  );
}

function EditReviewDialog({ review, onClose }: { review: Review; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ rating: String(review.rating), comment: review.comment, guestName: review.guestName ?? "", privateNote: review.privateNote ?? "" });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const res = await fetch(`/api/reviews/${review.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: Number(f.rating), comment: f.comment, guestName: f.guestName || null, privateNote: f.privateNote || null }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.error ?? "Couldn't save");
    toast.success("Review updated");
    router.refresh();
    onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Edit review · ${review.listing}`} className="max-w-lg">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Guest">
              <input className={inputClass} value={f.guestName} onChange={(e) => setF({ ...f, guestName: e.target.value })} />
            </Field>
            <Field label="Rating">
              <Select value={f.rating} onValueChange={(v) => setF({ ...f, rating: v })} options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} ★` }))} />
            </Field>
          </div>
          <Field label="Review">
            <textarea className={cn(inputClass, "min-h-[110px]")} value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} />
          </Field>
          <Field label="Private feedback (optional)">
            <textarea className={cn(inputClass, "min-h-[64px]")} value={f.privateNote} onChange={(e) => setF({ ...f, privateNote: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy || !f.comment.trim()}>
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
