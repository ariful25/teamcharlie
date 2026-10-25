"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { inputClass } from "@/components/shared/form-field";
import { useTeamTimezone } from "@/components/providers/team-timezone";
import { formatClientDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";

export type InboxItem = {
  id: string;
  kind?: string;
  subject: string;
  receivedAt: string;
  snippet: string;
  propertyId: string | null;
  guestName: string | null;
  rating: number | null;
  comment: string;
  link: string | null;
};

const STARS = [5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} ★` }));

/** Airbnb review emails the reader couldn't fully read, waiting for a person. */
export function ReviewInbox({ items, listings }: { items: InboxItem[]; listings: { id: string; name: string }[] }) {
  if (items.length === 0) return null;
  return (
    <section className="glass rounded-2xl shadow-card">
      <header className="flex flex-wrap items-center gap-3 border-b border-border/60 px-5 py-3">
        <Inbox className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Review inbox</h2>
        <span className="text-xs text-muted-foreground">
          {items.length === 1 ? "1 Airbnb email needs" : `${items.length} Airbnb emails need`} a person to finish {items.length === 1 ? "it" : "them"}
        </span>
      </header>
      <ul className="divide-y divide-border/60">
        {items.map((i) =>
          i.kind && i.kind !== "GUEST_REVIEW" ? <StayRow key={i.id} item={i} listings={listings} /> : <InboxRow key={i.id} item={i} listings={listings} />
        )}
      </ul>
    </section>
  );
}

function InboxRow({ item, listings }: { item: InboxItem; listings: { id: string; name: string }[] }) {
  const router = useRouter();
  const tz = useTeamTimezone();
  const [f, setF] = useState({ propertyId: item.propertyId ?? "", rating: item.rating ? String(item.rating) : "", comment: item.comment, guestName: item.guestName ?? "" });
  const [busy, setBusy] = useState(false);

  async function act(action: "SAVE" | "IGNORE") {
    setBusy(true);
    const res = await fetch(`/api/listing-health/review-inbox/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action === "IGNORE" ? { action } : { action, propertyId: f.propertyId, rating: Number(f.rating), comment: f.comment, guestName: f.guestName || null }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.error ?? "Couldn't update that email");
    toast.success(action === "SAVE" ? "Review saved" : "Email dismissed");
    router.refresh();
  }

  return (
    <li className="space-y-3 px-5 py-4 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">{item.subject}</p>
        <span className="text-xs text-muted-foreground">{formatClientDateTime(new Date(item.receivedAt), tz)}</span>
      </div>
      {!item.comment && (
        <p className="text-xs text-muted-foreground">
          The email didn&apos;t include the review text.{" "}
          {item.link && (
            <a href={item.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
              Open it on Airbnb <ExternalLink className="h-3 w-3" />
            </a>
          )}{" "}
          and paste it below.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <input value={f.guestName} onChange={(e) => setF({ ...f, guestName: e.target.value })} placeholder="Guest" aria-label="Guest name" className={cn(inputClass, "h-9 w-36 py-1")} />
        <div className="w-28">
          <Select value={f.rating} onValueChange={(v) => setF({ ...f, rating: v })} placeholder="Stars" options={STARS} className="h-9" />
        </div>
        <div className="min-w-[12rem] flex-1">
          <Select value={f.propertyId} onValueChange={(v) => setF({ ...f, propertyId: v })} placeholder="Which listing?" options={listings.map((l) => ({ value: l.id, label: l.name }))} className="h-9" />
        </div>
      </div>
      <textarea value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} placeholder="Review text" aria-label="Review text" className={cn(inputClass, "min-h-[64px]")} />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => act("IGNORE")}>
          Not a review
        </Button>
        <Button size="sm" disabled={busy || !f.propertyId || !f.rating || !f.comment.trim()} onClick={() => act("SAVE")}>
          Save review
        </Button>
      </div>
    </li>
  );
}

const KIND_LABEL: Record<string, string> = { CONFIRMED: "Booking", ALTERED: "Change", CANCELLED: "Cancellation", CHECKOUT: "Checkout" };

/** A reservation/checkout email we couldn't tie to a guest or listing: start tracking the stay by hand. */
function StayRow({ item, listings }: { item: InboxItem; listings: { id: string; name: string }[] }) {
  const router = useRouter();
  const tz = useTeamTimezone();
  const [f, setF] = useState({ guestName: item.guestName ?? "", propertyId: item.propertyId ?? "", checkOut: "" });
  const [busy, setBusy] = useState(false);

  async function act(action: "STAY" | "IGNORE") {
    setBusy(true);
    const res = await fetch(`/api/listing-health/review-inbox/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action === "IGNORE" ? { action } : { action, ...f }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.error ?? "Couldn't update that email");
    toast.success(action === "STAY" ? "Now tracking this stay" : "Email dismissed");
    router.refresh();
  }

  return (
    <li className="space-y-3 px-5 py-4 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">
          <span className="mr-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{KIND_LABEL[item.kind ?? ""] ?? "Airbnb"}</span>
          {item.subject}
        </p>
        <span className="text-xs text-muted-foreground">{formatClientDateTime(new Date(item.receivedAt), tz)}</span>
      </div>
      <p className="line-clamp-2 text-xs text-muted-foreground">{item.snippet}</p>
      <div className="flex flex-wrap gap-2">
        <input value={f.guestName} onChange={(e) => setF({ ...f, guestName: e.target.value })} placeholder="Guest" aria-label="Guest name" className={cn(inputClass, "h-9 w-40 py-1")} />
        <div className="min-w-[12rem] flex-1">
          <Select value={f.propertyId} onValueChange={(v) => setF({ ...f, propertyId: v })} placeholder="Which listing?" options={listings.map((l) => ({ value: l.id, label: l.name }))} className="h-9" />
        </div>
        <div className="w-44">
          <DatePicker value={f.checkOut} onChange={(v) => setF({ ...f, checkOut: v })} placeholder="Checkout date" className="h-9" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => act("IGNORE")}>
          Dismiss
        </Button>
        <Button size="sm" disabled={busy || !f.guestName.trim() || !f.propertyId || !f.checkOut} onClick={() => act("STAY")}>
          Start tracking
        </Button>
      </div>
    </li>
  );
}
