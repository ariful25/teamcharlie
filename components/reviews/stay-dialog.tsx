"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Copy, ExternalLink, Frown, Smile } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { inputClass } from "@/components/shared/form-field";
import { formatYmd } from "@/components/ui/date-picker";
import { useTeamTimezone } from "@/components/providers/team-timezone";
import { formatClientDateTime } from "@/lib/time";
import { fillTemplate } from "@/lib/reviews/templates";
import { STAGES } from "@/lib/reviews/pipeline";
import { cn } from "@/lib/utils";
import type { ReviewHub } from "@/lib/reviews/queries";
import { WindowRing } from "./window-ring";

type Stay = ReviewHub["stays"][number];
type Templates = ReviewHub["templates"];

const EVENT_LABEL: Record<string, string> = {
  BOOKED: "Booking received",
  ALTERED: "Reservation changed",
  CHANGE_REQUESTED: "Guest asked to change dates",
  CANCELLED: "Cancelled",
  CHECKED_OUT: "Checked out",
  FOLLOW_UP_SENT: "Follow-up sent",
  HAPPY: "Guest was happy",
  ISSUE: "Guest had an issue",
  ASK_REVIEW: "Ready to ask for a review",
  HOST_REVIEWED: "We reviewed the guest",
  REVIEW_REQUESTED: "Review request sent",
  REVIEWED: "Guest reviewed",
  RESPONDED: "Public response posted",
  EXPIRED: "Closed without a review",
  NOTE: "Note",
};

export function StayDialog({ stay, templates, onClose }: { stay: Stay; templates: Templates; onClose: () => void }) {
  const router = useRouter();
  const tz = useTeamTimezone();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(stay.issueNote ?? "");
  const vars = { firstName: stay.firstName, listing: stay.listing?.title ?? "our place" };
  const tpl = (key: string) => fillTemplate(templates.find((t) => t.key === key)?.body ?? "", vars);
  const stage = STAGES.find((s) => s.key === stay.stage);

  async function act(action: string, extra?: { note?: string }) {
    setBusy(true);
    const res = await fetch(`/api/reviews/stays/${stay.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.error ?? "Couldn't update the stay");
    toast.success("Updated");
    router.refresh();
    if (action !== "HOST_REVIEWED") onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={stay.guestName} className="max-w-2xl">
        <div className="max-h-[75vh] space-y-5 overflow-y-auto pr-1 text-sm">
          <div className="flex flex-wrap items-center gap-4">
            <WindowRing daysLeft={stay.daysLeft} rating={stay.rating} size={56} />
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {stay.listing ? (
                  <a href={stay.listing.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-primary">
                    {stay.listing.name} <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="text-warning">Listing not matched</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {stay.checkIn ? `${formatYmd(stay.checkIn)} → ` : "Checkout "}
                {stay.checkOut ? formatYmd(stay.checkOut) : "unknown"}
                {stay.guests ? ` · ${stay.guests} guests` : ""}
                {stay.confirmationCode ? ` · ${stay.confirmationCode}` : ""}
              </p>
            </div>
            <Badge tone={stay.stage === "ISSUE" ? "danger" : stay.stage === "REVIEWED" ? "success" : stay.stage === "CANCELLED" || stay.stage === "EXPIRED" ? "neutral" : "primary"}>{stage?.label ?? stay.stage}</Badge>
          </div>

          {stay.stage === "BOOKED" && <p className="text-muted-foreground">Nothing to do yet. On checkout day a follow-up task appears on the Tasks board.</p>}

          {stay.stage === "CHECKED_OUT" && (
            <Step title="1. Ask how the stay was" hint="Send in Airbnb or Akia. Don't ask for a review yet.">
              <MessageBox text={tpl("FOLLOW_UP")} />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy} onClick={() => act("FOLLOW_UP_SENT")}>
                  <CheckCircle2 className="h-4 w-4" /> Follow-up sent
                </Button>
                <OutcomeButtons busy={busy} note={note} setNote={setNote} act={act} />
              </div>
            </Step>
          )}

          {stay.stage === "FOLLOW_UP_SENT" && (
            <Step title="2. What did the guest say?" hint="Happy → ask for a review. A problem → fix it first.">
              <div className="flex flex-wrap gap-2">
                <OutcomeButtons busy={busy} note={note} setNote={setNote} act={act} />
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => act("REVIEW_REQUESTED")}>
                  No reply? Send the request anyway
                </Button>
              </div>
            </Step>
          )}

          {stay.stage === "ISSUE" && (
            <Step title="Fix the issue first" hint={stay.issueNote ? `Guest said: ${stay.issueNote}` : "Reply, fix it and only then ask for a review."}>
              <MessageBox text={tpl("ISSUE_RECOVERY")} />
              <Button size="sm" disabled={busy} onClick={() => act("ISSUE_RESOLVED")}>
                <CheckCircle2 className="h-4 w-4" /> Issue resolved, guest is OK
              </Button>
            </Step>
          )}

          {stay.stage === "ASK_REVIEW" && (
            <Step title="3. Review the guest, then ask" hint="Our review is honest and independent, never offered in exchange for theirs.">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={!!stay.hostReviewedAt} disabled={busy || !!stay.hostReviewedAt} onChange={() => act("HOST_REVIEWED")} />
                We&apos;ve left our review of {stay.firstName} on Airbnb
              </label>
              <MessageBox text={tpl("REVIEW_REQUEST")} />
              <Button size="sm" disabled={busy} onClick={() => act("REVIEW_REQUESTED")}>
                <CheckCircle2 className="h-4 w-4" /> Review request sent
              </Button>
            </Step>
          )}

          {stay.stage === "REVIEW_REQUESTED" && (
            <Step title="Waiting for the guest's review" hint={stay.daysLeft !== null ? `${Math.max(0, stay.daysLeft)} days left in Airbnb's 14-day window. It closes on its own; no need to chase.` : "The review arrives by email when it's posted."}>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => act("CLOSE")}>
                Close without a review
              </Button>
            </Step>
          )}

          {stay.stage === "REVIEWED" && stay.rating === null && (
            <Step title={`${stay.firstName} reviewed the stay`} hint="Airbnb hides it until we review them (or the 14 days end). Review them honestly on Airbnb; their rating arrives by email after.">
              {null}
            </Step>
          )}

          {stay.stage === "REVIEWED" && stay.rating !== null && (
            <Step title={`${stay.firstName} left ${stay.rating}★`} hint={stay.rating === 5 ? "Thank them in a public response." : "Respond calmly in public. Future guests read it. A task is on the board."}>
              {stay.rating === 5 && <MessageBox text={tpl("THANK_YOU")} />}
            </Step>
          )}

          <section>
            <h3 className="mb-2 text-xs font-medium text-muted-foreground">Timeline</h3>
            <ol className="space-y-2 border-l border-border pl-4">
              {stay.events.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary/70" />
                  <p>
                    {EVENT_LABEL[e.kind] ?? e.kind}
                    {e.detail && <span className="text-muted-foreground"> · {e.detail}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatClientDateTime(new Date(e.at), tz)}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Step({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-primary/25 bg-primary/5 p-5">
      <div>
        <h3 className="font-display text-base font-semibold">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function MessageBox({ text }: { text: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Message copied. Paste it in Airbnb or Akia.");
    } catch {
      toast.error("Couldn't copy. Select the text instead.");
    }
  }
  return (
    <div className="relative">
      <p className="whitespace-pre-wrap rounded-xl border border-border bg-background/40 p-3 pr-24 text-[13px] leading-relaxed">{text}</p>
      <Button size="sm" variant="secondary" className="absolute right-2 top-2" onClick={copy}>
        <Copy className="h-3.5 w-3.5" /> Copy
      </Button>
    </div>
  );
}

function OutcomeButtons({ busy, note, setNote, act }: { busy: boolean; note: string; setNote: (v: string) => void; act: (a: string, extra?: { note?: string }) => void }) {
  const [issueOpen, setIssueOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => act("HAPPY")}>
        <Smile className="h-4 w-4 text-success" /> Guest was happy
      </Button>
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => setIssueOpen((v) => !v)}>
        <Frown className="h-4 w-4 text-danger" /> Guest had an issue
      </Button>
      {issueOpen && (
        <div className="flex w-full gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What went wrong? (e.g. Wi-Fi down, hot tub cold)" className={cn(inputClass, "h-9 flex-1 py-1")} />
          <Button size="sm" variant="danger" disabled={busy} onClick={() => act("ISSUE", { note })}>
            Save issue
          </Button>
        </div>
      )}
    </>
  );
}
