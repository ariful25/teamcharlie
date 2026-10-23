"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { RecordView, ShiftState } from "@/lib/queries/attendance";

// Shared building blocks for the attendance screens. Deliberately built on
// the same primitives as the rest of the app (Card, Badge, the dashboard's
// stat-card look) so attendance doesn't drift into its own visual style.

import { Badge, type Tone as BadgeTone } from "@/components/ui/badge";
import { dayLabel } from "@/lib/attendance/format";
export { hm, dayLabel, timeIn, scheduleLabel } from "@/lib/attendance/format";

type Tone = "success" | "warning" | "danger" | "info" | "primary" | "muted" | "accent";

const badgeTone: Record<Tone, BadgeTone> = {
  success: "success",
  warning: "warning",
  danger: "danger",
  info: "info",
  primary: "primary",
  accent: "primary",
  muted: "neutral",
};

const valueTone: Record<Tone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  primary: "text-foreground",
  accent: "text-accent",
  muted: "text-foreground",
};

export const STATE_META: Record<ShiftState, { label: string; tone: Tone }> = {
  WORKING: { label: "Working now", tone: "success" },
  REQUESTED_CHECK_IN: { label: "Check-in requested", tone: "info" },
  AUTO_STOPPED: { label: "No check-out", tone: "danger" },
  NEEDS_REVIEW: { label: "Needs review", tone: "warning" },
  MISSED_SHIFT: { label: "Missed shift", tone: "danger" },
  LATE_NOT_IN: { label: "Not checked in", tone: "warning" },
  NOT_STARTED: { label: "Upcoming", tone: "muted" },
  DONE: { label: "Completed", tone: "primary" },
  ABSENT: { label: "Absent", tone: "danger" },
  LEAVE: { label: "On leave", tone: "info" },
  OFF: { label: "Off", tone: "muted" },
};

/** Thin wrapper over the app's Badge so attendance chips look like every other badge. */
export function Chip({ tone, children, className }: { tone: Tone; children: React.ReactNode; pulse?: boolean; className?: string }) {
  return (
    <Badge tone={badgeTone[tone]} className={cn("whitespace-nowrap", className)}>
      {children}
    </Badge>
  );
}

export function StateChip({ state }: { state: ShiftState }) {
  const meta = STATE_META[state];
  return <Chip tone={meta.tone}>{meta.label}</Chip>;
}

/** Small explicit "which day" label used on every row and dialog. */
export function DayBadge({ dayKey, today }: { dayKey: string; today?: string }) {
  return (
    <Badge tone={today === dayKey ? "primary" : "neutral"}>
      {dayLabel(dayKey)}
      {today === dayKey && " · today"}
    </Badge>
  );
}

/** Same look as the dashboard's StatCard (label, then the number). */
export function StatTile({
  label,
  value,
  hint,
  tone = "primary",
  active,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: Tone;
  active?: boolean;
  onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "glass rounded-2xl p-4 text-left shadow-card transition-shadow",
        onClick && "cursor-pointer hover:shadow-glow-sm",
        active && "ring-2 ring-primary/50"
      )}
    >
      <span className="block text-xs font-medium text-muted-foreground">{label}</span>
      <span className={cn("mt-3 block text-2xl font-semibold tabular-nums", valueTone[tone])}>{value}</span>
      {hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}
    </Comp>
  );
}

/** A Card with the app's standard header (CardTitle style). */
export function Panel({ title, action, children, className }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("glass overflow-hidden rounded-2xl shadow-card", className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-5 py-3.5">
          {typeof title === "string" ? <h3 className="text-sm font-semibold text-foreground">{title}</h3> : title}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/**
 * Horizontal shift timeline: scheduled window (outlined), worked time
 * (filled), approved overtime (accent), unapproved extra (striped) and the
 * auto-stop marker. Makes "what actually happened on this shift" readable at
 * a glance instead of comparing four timestamps.
 */
/** Current time, ticking every minute — null during SSR/first render so the
 *  server and client markup match (a live `new Date()` caused hydration
 *  mismatches on running shifts). */
function useNow() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function ShiftTimeline({ v, compact }: { v: RecordView; compact?: boolean }) {
  const now = useNow();
  const start = v.effectiveCheckIn ?? v.actualCheckIn ?? v.claimedCheckIn ?? v.checkInRequestedAt;
  const end =
    v.effectiveCheckOut ??
    v.actualCheckOut ??
    v.claimedCheckOut ??
    // Time after an auto-stop never counts, even if they pressed check-out later.
    v.autoClosedAt ??
    v.reportedCheckOutAt ??
    (v.state === "WORKING" && now !== null ? new Date(now).toISOString() : null);
  const points = [v.shiftStartAt, v.shiftEndAt, start, end, v.autoClosedAt].filter(Boolean).map((x) => new Date(x!).getTime());
  if (points.length === 0) {
    return <div className={cn("rounded-full bg-muted/30", compact ? "h-1.5" : "h-2.5")} />;
  }
  const min = Math.min(...points) - 30 * 60 * 1000;
  const max = Math.max(...points) + 30 * 60 * 1000;
  const pct = (t: number) => `${((t - min) / (max - min)) * 100}%`;
  const width = (a: number, b: number) => `${(Math.max(0, b - a) / (max - min)) * 100}%`;

  const s0 = v.shiftStartAt ? new Date(v.shiftStartAt).getTime() : null;
  const s1 = v.shiftEndAt ? new Date(v.shiftEndAt).getTime() : null;
  const w0 = start ? new Date(start).getTime() : null;
  const w1 = end ? new Date(end).getTime() : null;
  const pending = v.review === "PENDING";
  const otEnd = s1 !== null ? s1 + v.credit.overtimeMinutes * 60000 : null;

  return (
    <div className={cn("relative w-full rounded-full bg-muted/30", compact ? "h-1.5" : "h-2.5")} aria-hidden="true">
      {s0 !== null && s1 !== null && (
        <span className="absolute inset-y-[-3px] rounded-full border border-primary/40" style={{ left: pct(s0), width: width(s0, s1) }} />
      )}
      {w0 !== null && w1 !== null && (
        <>
          <span
            className={cn("absolute inset-y-0 rounded-full", pending ? "bg-warning/70" : "bg-primary")}
            style={{ left: pct(w0), width: width(w0, s1 !== null ? Math.min(w1, s1) : w1) }}
          />
          {s1 !== null && otEnd !== null && w1 > s1 && v.credit.overtimeMinutes > 0 && (
            <span className="absolute inset-y-0 rounded-full bg-accent" style={{ left: pct(s1), width: width(s1, Math.min(w1, otEnd)) }} />
          )}
          {s1 !== null && w1 > (otEnd ?? s1) && (
            <span
              className="absolute inset-y-0 rounded-full bg-[repeating-linear-gradient(45deg,hsl(var(--danger)/0.7)_0_3px,transparent_3px_6px)]"
              style={{ left: pct(otEnd ?? s1), width: width(otEnd ?? s1, w1) }}
            />
          )}
        </>
      )}
      {v.autoClosedAt && (
        <span className="absolute -inset-y-1.5 w-0.5 rounded bg-danger" style={{ left: pct(new Date(v.autoClosedAt).getTime()) }} />
      )}
    </div>
  );
}

export function TimelineLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full border border-primary/50" /> Scheduled</span>
      <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-primary" /> Worked</span>
      <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-warning/70" /> Pending review</span>
      <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-accent" /> Approved overtime</span>
      <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-[repeating-linear-gradient(45deg,hsl(var(--danger)/0.7)_0_3px,transparent_3px_6px)]" /> Unapproved extra</span>
      <span className="flex items-center gap-1.5"><span className="h-3 w-0.5 rounded bg-danger" /> Auto-stop</span>
    </div>
  );
}
