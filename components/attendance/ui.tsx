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

type CellKind = "worked" | "pending" | "overtime" | "extra" | "missed" | "idle";

const CELL_CLASS: Record<CellKind, string> = {
  worked: "bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.55)]",
  pending: "bg-warning/80",
  overtime: "bg-accent shadow-[0_0_6px_hsl(var(--accent)/0.5)]",
  extra: "bg-[repeating-linear-gradient(45deg,hsl(var(--danger)/0.85)_0_2px,hsl(var(--danger)/0.25)_2px_4px)]",
  missed: "bg-primary/15",
  idle: "bg-muted/25",
};

const HEX = "polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)";
const SLOT = 30 * 60 * 1000;

/** Ring: share of the scheduled shift actually covered, plus an inner arc
 *  for time past the schedule (approved overtime / unapproved extra). */
export function ShiftRing({ v, size = 40 }: { v: RecordView; size?: number }) {
  const s0 = v.shiftStartAt ? new Date(v.shiftStartAt).getTime() : null;
  const s1 = v.shiftEndAt ? new Date(v.shiftEndAt).getTime() : null;
  const sched = s0 !== null && s1 !== null ? (s1 - s0) / 60000 : 0;
  const pending = v.credit.bucket === "pending" || v.credit.bucket === "open";
  const covered = pending ? Math.min(v.credit.workedMinutes, sched) : v.credit.regularMinutes;
  const ratio = sched > 0 ? Math.min(1, covered / sched) : 0;
  const otRatio = sched > 0 ? Math.min(1, v.credit.overtimeMinutes / sched) : 0;
  const exRatio = sched > 0 ? Math.min(1 - otRatio, v.credit.extraMinutes / sched) : 0;

  const r = size / 2 - 3;
  const ri = r - 5;
  const c = 2 * Math.PI * r;
  const ci = 2 * Math.PI * ri;
  const label = sched > 0 ? `${Math.round((covered / sched) * 100)}%` : "—";

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} title={sched > 0 ? `${label} of the scheduled shift` : "No schedule"}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={3} className="stroke-muted/40" />
        {ratio > 0 && <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={`${c * ratio} ${c}`}
          className={cn(pending ? "stroke-warning" : "stroke-primary", "transition-[stroke-dasharray] duration-700")}
          style={{ filter: `drop-shadow(0 0 3px hsl(var(--${pending ? "warning" : "primary"}) / 0.7))` }}
        />}
        {otRatio > 0 && (
          <circle cx={size / 2} cy={size / 2} r={ri} fill="none" strokeWidth={2} strokeLinecap="round" strokeDasharray={`${ci * otRatio} ${ci}`} className="stroke-accent" />
        )}
        {exRatio > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={ri}
            fill="none"
            strokeWidth={2}
            className="stroke-danger"
            style={{ strokeDasharray: `${ci * exRatio} ${ci}`, strokeDashoffset: -ci * otRatio }}
          />
        )}
      </svg>
      <span className={cn("absolute inset-0 flex items-center justify-center font-semibold tabular-nums tracking-tighter", label.length > 3 ? "text-[9px]" : "text-[10px]")}>
        {label}
      </span>
    </div>
  );
}

/**
 * Shift timeline as a row of hexagon cells, one per half hour: scheduled but
 * not worked (dim), worked (cyan glow), pending review (amber), approved
 * overtime (accent), unapproved extra (red hatch), with an auto-stop marker.
 * Compact rows also get a coverage ring on the left.
 */
export function ShiftTimeline({ v, compact }: { v: RecordView; compact?: boolean }) {
  const cells = useShiftCells(v);
  const h = compact ? "h-3" : "h-4";
  if (!cells) {
    return <div className={cn("rounded-full bg-muted/30", compact ? "h-1.5" : "h-2.5")} />;
  }
  const strip = (
    <div className="relative min-w-0 flex-1" aria-hidden="true">
      <div className="flex gap-[2px]">
        {cells.list.map((k, i) => (
          <span
            key={i}
            className={cn(h, "min-w-[5px] flex-1 transition-colors", CELL_CLASS[k], cells.live === i && "animate-pulse")}
            style={{ clipPath: HEX }}
          />
        ))}
      </div>
      {cells.autoStop !== null && (
        <span className="absolute -inset-y-1 w-0.5 rounded bg-danger shadow-[0_0_6px_hsl(var(--danger))]" style={{ left: `${cells.autoStop}%` }} />
      )}
    </div>
  );
  if (!compact) return strip;
  return (
    <div className="flex items-center gap-3">
      <ShiftRing v={v} size={40} />
      {strip}
    </div>
  );
}

function useShiftCells(v: RecordView) {
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
  if (points.length === 0) return null;
  const min = Math.floor(Math.min(...points) / SLOT) * SLOT;
  const max = Math.max(min + SLOT, Math.ceil(Math.max(...points) / SLOT) * SLOT);

  const s0 = v.shiftStartAt ? new Date(v.shiftStartAt).getTime() : null;
  const s1 = v.shiftEndAt ? new Date(v.shiftEndAt).getTime() : null;
  const w0 = start ? new Date(start).getTime() : null;
  const w1 = end ? new Date(end).getTime() : null;
  const pending = v.review === "PENDING";
  const otEnd = s1 !== null ? s1 + v.credit.overtimeMinutes * 60000 : null;

  // A cell takes the kind of whatever covers most of its half hour.
  const kindAt = (t: number): CellKind => {
    const worked = w0 !== null && w1 !== null && t >= w0 && t < w1;
    const scheduled = s0 !== null && s1 !== null && t >= s0 && t < s1;
    if (worked) {
      if (s1 === null || t < s1) return pending ? "pending" : "worked";
      return otEnd !== null && t < otEnd ? "overtime" : "extra";
    }
    return scheduled ? "missed" : "idle";
  };
  const list: CellKind[] = [];
  let live: number | null = null;
  for (let t = min, i = 0; t < max; t += SLOT, i++) {
    const kinds = [t + SLOT * 0.25, t + SLOT * 0.5, t + SLOT * 0.75].map(kindAt);
    const busy = kinds.filter((k) => k !== "idle" && k !== "missed");
    list.push(busy.length >= 2 ? busy[1] : kinds[1]);
    if (v.state === "WORKING" && now !== null && now >= t && now < t + SLOT) live = i;
  }
  const autoStop = v.autoClosedAt ? ((new Date(v.autoClosedAt).getTime() - min) / (max - min)) * 100 : null;
  return { list, live, autoStop };
}

export function TimelineLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      {(
        [
          ["missed", "Scheduled, not worked"],
          ["worked", "Worked"],
          ["pending", "Pending review"],
          ["overtime", "Approved overtime"],
          ["extra", "Unapproved extra"],
        ] as const
      ).map(([k, label]) => (
        <span key={k} className="flex items-center gap-1.5">
          <span className={cn("h-2.5 w-3", CELL_CLASS[k])} style={{ clipPath: HEX }} /> {label}
        </span>
      ))}
      <span className="flex items-center gap-1.5"><span className="h-3 w-0.5 rounded bg-danger" /> Auto-stop</span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-full border-2 border-primary" /> Ring = % of scheduled shift covered
      </span>
    </div>
  );
}
