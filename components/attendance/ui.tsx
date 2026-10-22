"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { RecordView, ShiftState } from "@/lib/queries/attendance";

// Shared building blocks for the attendance screens: state chips with a
// glowing status dot, explicit shift-day labels, HUD-style number tiles and
// the shift timeline bar. Everything uses the app's tokens (globals.css).

import { dayLabel } from "@/lib/attendance/format";
export { hm, dayLabel, timeIn, scheduleLabel } from "@/lib/attendance/format";

type Tone = "success" | "warning" | "danger" | "info" | "primary" | "muted" | "accent";

const toneDot: Record<Tone, string> = {
  success: "bg-success shadow-[0_0_10px_hsl(var(--success))]",
  warning: "bg-warning shadow-[0_0_10px_hsl(var(--warning))]",
  danger: "bg-danger shadow-[0_0_10px_hsl(var(--danger))]",
  info: "bg-info shadow-[0_0_10px_hsl(var(--info))]",
  primary: "bg-primary shadow-[0_0_10px_hsl(var(--primary))]",
  accent: "bg-accent shadow-[0_0_10px_hsl(var(--accent))]",
  muted: "bg-muted-foreground/50",
};

const toneChip: Record<Tone, string> = {
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-danger/30 bg-danger/10 text-danger",
  info: "border-info/30 bg-info/10 text-info",
  primary: "border-primary/30 bg-primary/10 text-primary",
  accent: "border-accent/30 bg-accent/10 text-accent",
  muted: "border-border bg-muted/40 text-muted-foreground",
};

export const STATE_META: Record<ShiftState, { label: string; tone: Tone; pulse?: boolean }> = {
  WORKING: { label: "Working now", tone: "success", pulse: true },
  REQUESTED_CHECK_IN: { label: "Check-in requested", tone: "info", pulse: true },
  AUTO_STOPPED: { label: "No check-out · auto-stopped", tone: "danger" },
  NEEDS_REVIEW: { label: "Needs review", tone: "warning" },
  MISSED_SHIFT: { label: "Missed shift", tone: "danger" },
  LATE_NOT_IN: { label: "Not checked in", tone: "warning", pulse: true },
  NOT_STARTED: { label: "Upcoming", tone: "muted" },
  DONE: { label: "Completed", tone: "primary" },
  ABSENT: { label: "Absent", tone: "danger" },
  LEAVE: { label: "On leave", tone: "accent" },
  OFF: { label: "Off", tone: "muted" },
};

export function Dot({ tone, pulse }: { tone: Tone; pulse?: boolean }) {
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0">
      {pulse && <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", toneDot[tone].split(" ")[0])} />}
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", toneDot[tone])} />
    </span>
  );
}

export function Chip({ tone, children, pulse, className }: { tone: Tone; children: React.ReactNode; pulse?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium", toneChip[tone], className)}>
      <Dot tone={tone} pulse={pulse} />
      {children}
    </span>
  );
}

export function StateChip({ state }: { state: ShiftState }) {
  const meta = STATE_META[state];
  return (
    <Chip tone={meta.tone} pulse={meta.pulse}>
      {meta.label}
    </Chip>
  );
}

/** Small explicit "which day" badge used on every row and dialog. */
export function DayBadge({ dayKey, today }: { dayKey: string; today?: string }) {
  const isToday = today === dayKey;
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/30 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
      {dayLabel(dayKey)}
      {isToday && <span className="text-primary">· today</span>}
    </span>
  );
}

/** A HUD-like number tile. */
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
        "glass group relative overflow-hidden rounded-2xl p-4 text-left transition",
        onClick && "hover:border-primary/40",
        active && "ring-2 ring-primary/50"
      )}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        <Dot tone={tone} />
        {label}
      </span>
      <span className="mt-2 block font-mono text-2xl font-semibold tabular-nums tracking-tight">{value}</span>
      {hint && <span className="mt-0.5 block text-[11px] text-muted-foreground">{hint}</span>}
    </Comp>
  );
}

export function Panel({ title, action, children, className }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("glass relative overflow-hidden rounded-2xl", className)}>
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-primary/60 via-accent/40 to-transparent" />
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-5 py-3">
          {typeof title === "string" ? (
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{title}</h2>
          ) : (
            title
          )}
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
            className={cn("absolute inset-y-0 rounded-full", pending ? "bg-warning/70" : "bg-primary shadow-[0_0_10px_hsl(var(--primary)/0.6)]")}
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
        <span className="absolute -inset-y-1.5 w-0.5 rounded bg-danger shadow-[0_0_8px_hsl(var(--danger))]" style={{ left: pct(new Date(v.autoClosedAt).getTime()) }} />
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
