"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ClipboardPaste, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { Field, inputClass } from "@/components/shared/form-field";
import { PasteReviewsDialog } from "@/components/listing-health/paste-reviews";
import { ReviewInbox } from "@/components/listing-health/review-inbox";
import { cn } from "@/lib/utils";
import type { ReviewHub as Hub } from "@/lib/reviews/queries";
import { PipelineBoard } from "./pipeline-board";
import { ReviewsTable } from "./reviews-table";
import { TemplatesEditor } from "./templates-editor";

type Tab = "pipeline" | "reviews" | "inbox" | "messages";

const pct = (v: number | null) => (v === null ? "·" : `${Math.round(v * 100)}%`);

export function ReviewHub({ hub, canManage }: { hub: Hub; canManage: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>(((params.get("tab") as Tab) || (params.get("stay") ? "pipeline" : "pipeline")) as Tab);
  const [clientId, setClientId] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const listingIds = clientId ? new Set(hub.listings.filter((l) => l.clientId === clientId).map((l) => l.id)) : null;
  const stays = listingIds ? hub.stays.filter((s) => s.listing && listingIds.has(s.listing.id)) : hub.stays;
  const reviews = clientId ? hub.reviews.filter((r) => r.clientId === clientId) : hub.reviews;
  const listings = (clientId ? hub.listings.filter((l) => l.clientId === clientId) : hub.listings).map((l) => ({ id: l.id, name: l.name }));
  const openWork = stays.filter((s) => ["CHECKED_OUT", "FOLLOW_UP_SENT", "ISSUE", "ASK_REVIEW"].includes(s.stage)).length;

  function go(next: Tab) {
    setTab(next);
    router.replace(`${pathname}?tab=${next}`, { scroll: false });
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "pipeline", label: "Guest pipeline", count: openWork },
    { id: "reviews", label: "All reviews", count: reviews.length },
    { id: "inbox", label: "Inbox", count: hub.inbox.length },
    { id: "messages", label: "Messages" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Reviews</h1>
          <p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">
            Every Airbnb guest from booking to review: follow up after checkout, fix problems and ask happy guests for a 5-star review.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {hub.clients.length > 1 && (
            <div className="w-44">
              <Select value={clientId} onValueChange={setClientId} options={[{ value: "", label: "All clients" }, ...hub.clients.map((c) => ({ value: c.id, label: c.name }))]} />
            </div>
          )}
          {canManage && (
            <>
              <Button variant="secondary" onClick={() => setPasteOpen(true)}>
                <ClipboardPaste className="h-4 w-4" /> Paste reviews
              </Button>
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" /> Add a stay
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="5★ share" value={pct(hub.kpis.fiveStarShare)} hint={`${hub.kpis.reviews90} reviews · 90 days`} tone={hub.kpis.fiveStarShare !== null && hub.kpis.fiveStarShare < 0.8 ? "text-warning" : "text-success"} />
        <Kpi label="Average rating" value={hub.kpis.average === null ? "·" : hub.kpis.average.toFixed(2)} hint="90 days" />
        <Kpi label="Review rate" value={pct(hub.kpis.reviewRate)} hint="checked-out guests who reviewed" />
        <Kpi label="Needs a response" value={String(hub.kpis.needsResponse)} hint="under-5★ reviews not answered" tone={hub.kpis.needsResponse ? "text-warning" : undefined} />
      </div>

      <div className="space-y-5">
        <div role="tablist" aria-label="Reviews views" className="glass flex gap-1 overflow-x-auto rounded-2xl p-1.5 shadow-card">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => go(t.id)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm transition-colors",
                tab === t.id ? "bg-primary/15 font-medium text-primary shadow-glow-sm" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              )}
            >
              {t.label}
              {t.count !== undefined && t.count > 0 && <span className="rounded-full bg-muted/60 px-1.5 text-xs tabular-nums">{t.count}</span>}
            </button>
          ))}
        </div>

        {tab === "pipeline" && <PipelineBoard hub={hub} stays={stays} />}
        {tab === "reviews" && <ReviewsTable reviews={reviews} />}
        {tab === "inbox" &&
          (hub.inbox.length ? (
            <ReviewInbox items={hub.inbox} listings={hub.listings.map((l) => ({ id: l.id, name: l.name }))} />
          ) : (
            <p className="glass rounded-2xl px-5 py-12 text-center text-sm text-muted-foreground">
              Nothing waiting. Airbnb emails the app couldn&apos;t read on its own land here.
            </p>
          ))}
        {tab === "messages" && <TemplatesEditor templates={hub.templates} />}
      </div>

      <PasteReviewsDialog open={pasteOpen} onOpenChange={setPasteOpen} clientId={clientId || null} listings={listings} aiReady={hub.aiReady} />
      {addOpen && <AddStayDialog listings={listings} onClose={() => setAddOpen(false)} />}
    </div>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: string }) {
  return (
    <div className="glass rounded-2xl px-5 py-3 shadow-card">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-2 font-display text-3xl font-semibold tabular-nums", tone)}>{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function AddStayDialog({ listings, onClose }: { listings: { id: string; name: string }[]; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ guestName: "", propertyId: "", checkIn: "", checkOut: "", confirmationCode: "" });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const res = await fetch("/api/reviews/stays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, checkIn: f.checkIn || null, confirmationCode: f.confirmationCode || null }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.error ?? "Couldn't add the stay");
    toast.success("Stay added");
    router.refresh();
    onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Add a stay" className="max-w-lg">
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">For bookings from before Review email sync was on. Checked-out stays get their follow-up task right away.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Guest name">
              <input className={inputClass} value={f.guestName} onChange={(e) => setF({ ...f, guestName: e.target.value })} />
            </Field>
            <Field label="Confirmation code (optional)">
              <input className={inputClass} value={f.confirmationCode} onChange={(e) => setF({ ...f, confirmationCode: e.target.value.toUpperCase() })} placeholder="HMABCD1234" />
            </Field>
          </div>
          <Field label="Listing">
            <Select value={f.propertyId} onValueChange={(v) => setF({ ...f, propertyId: v })} placeholder="Which listing?" options={listings.map((l) => ({ value: l.id, label: l.name }))} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Check-in (optional)">
              <DatePicker value={f.checkIn} onChange={(v) => setF({ ...f, checkIn: v })} />
            </Field>
            <Field label="Checkout">
              <DatePicker value={f.checkOut} min={f.checkIn || undefined} onChange={(v) => setF({ ...f, checkOut: v })} />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy || !f.guestName.trim() || !f.propertyId || !f.checkOut}>
              {busy ? "Adding…" : "Add stay"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
