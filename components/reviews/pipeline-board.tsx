"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatYmd } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";
import { STAGES } from "@/lib/reviews/pipeline";
import type { ReviewHub } from "@/lib/reviews/queries";
import { StayDialog } from "./stay-dialog";
import { WindowRing } from "./window-ring";

type Stay = ReviewHub["stays"][number];

// The work lanes, in the order the team moves guests through them.
const LANES = ["CHECKED_OUT", "FOLLOW_UP_SENT", "ISSUE", "ASK_REVIEW", "REVIEW_REQUESTED"] as const;
const LANE_ACCENT: Record<string, string> = {
  CHECKED_OUT: "bg-primary",
  FOLLOW_UP_SENT: "bg-info",
  ISSUE: "bg-danger",
  ASK_REVIEW: "bg-accent",
  REVIEW_REQUESTED: "bg-warning",
};

export function PipelineBoard({ hub, stays }: { hub: ReviewHub; stays: Stay[] }) {
  const params = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(params.get("stay"));
  useEffect(() => {
    const id = params.get("stay");
    if (id) setOpenId(id);
  }, [params]);
  const open = hub.stays.find((s) => s.id === openId) ?? null;

  const upcoming = stays.filter((s) => s.stage === "BOOKED").sort((a, b) => (a.checkOut ?? "").localeCompare(b.checkOut ?? ""));
  const closed = stays.filter((s) => ["REVIEWED", "EXPIRED", "CANCELLED"].includes(s.stage)).sort((a, b) => (b.checkOut ?? "").localeCompare(a.checkOut ?? ""));

  return (
    <div className="space-y-5">
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0">
        {LANES.map((key) => {
          const meta = STAGES.find((s) => s.key === key)!;
          const items = stays.filter((s) => s.stage === key);
          return (
            <section key={key} className="glass flex w-72 shrink-0 flex-col rounded-2xl shadow-card lg:w-auto">
              <header className="flex items-center gap-2 border-b border-border/60 px-3 py-3">
                <span className={cn("h-2 w-2 rounded-full", LANE_ACCENT[key])} />
                <h3 className="text-sm font-semibold">{meta.label}</h3>
                <span className="ml-auto rounded-full bg-muted/50 px-2 text-xs tabular-nums text-muted-foreground">{items.length}</span>
              </header>
              <p className="px-3 pt-2 text-[11px] text-muted-foreground">{meta.hint}</p>
              <ul className="space-y-2 p-3">
                {items.length === 0 && <li className="rounded-xl border border-dashed border-border/60 py-5 text-center text-xs text-muted-foreground">Nobody here</li>}
                {items.map((s) => (
                  <li key={s.id}>
                    <StayCard stay={s} onOpen={() => setOpenId(s.id)} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-golden">
        <section className="glass min-w-0 rounded-2xl shadow-card">
          <header className="flex items-baseline justify-between border-b border-border/60 px-5 py-3">
            <h3 className="text-sm font-semibold">Recently closed</h3>
            <span className="text-xs text-muted-foreground">last 30 days</span>
          </header>
          {closed.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">Reviewed, expired and cancelled stays show here.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {closed.slice(0, 30).map((s) => (
                <li key={s.id}>
                  <button onClick={() => setOpenId(s.id)} className="flex w-full items-center gap-3 px-5 py-2.5 text-left text-sm hover:bg-muted/20">
                    <WindowRing daysLeft={s.daysLeft} rating={s.rating} size={34} />
                    <span className="min-w-0 flex-1 truncate">
                      {s.guestName} <span className="text-muted-foreground">· {s.listing?.name ?? "No listing"}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">{s.stage === "REVIEWED" ? (s.rating === null ? "Hidden" : `${s.rating}★`) : s.stage === "EXPIRED" ? "No review" : "Cancelled"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="glass min-w-0 rounded-2xl shadow-card">
          <header className="flex items-baseline justify-between border-b border-border/60 px-5 py-3">
            <h3 className="text-sm font-semibold">Coming up</h3>
            <span className="text-xs text-muted-foreground">booked, not checked out</span>
          </header>
          {upcoming.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">Bookings appear here from Airbnb&apos;s confirmation emails.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {upcoming.slice(0, 30).map((s) => (
                <li key={s.id}>
                  <button onClick={() => setOpenId(s.id)} className="flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left text-sm hover:bg-muted/20">
                    <span className="min-w-0 truncate">
                      {s.guestName} <span className="text-muted-foreground">· {s.listing?.name ?? "No listing"}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">out {s.checkOut ? formatYmd(s.checkOut) : "?"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {open && <StayDialog stay={open} templates={hub.templates} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function StayCard({ stay, onOpen }: { stay: Stay; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-3 rounded-xl border border-border bg-background/30 p-2.5 text-left transition-colors hover:border-primary/40">
      <WindowRing daysLeft={stay.daysLeft} rating={stay.rating} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{stay.guestName}</span>
        <span className="block truncate text-xs text-muted-foreground">{stay.listing?.name ?? "Listing not matched"}</span>
        {stay.issueNote && stay.stage === "ISSUE" && <span className="block truncate text-xs text-danger">{stay.issueNote}</span>}
      </span>
    </button>
  );
}
