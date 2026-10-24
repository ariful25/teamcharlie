"use client";


import { cn } from "@/lib/utils";
import type { RecordView, ShiftState } from "@/lib/queries/attendance";

// Shared building blocks for the attendance screens. Deliberately built on
// the same primitives as the rest of the app (Card, Badge, the dashboard's
// stat-card look) so attendance doesn't drift into its own visual style.

import { Badge, type Tone as BadgeTone } from "@/components/ui/badge";
import { dayLabel } from "@/lib/attendance/format";
import { ShiftDial } from "./shift-dial";
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

/** One shift as a 24-hour dial (see shift-dial.tsx). Compact in lists,
 *  large in the review dialog. */
export function ShiftTimeline({ v, compact }: { v: RecordView; compact?: boolean }) {
  return <ShiftDial v={v} size={compact ? 72 : 156} />;
}

const LEGEND: { label: string; swatch: string }[] = [
  { label: "Scheduled hours", swatch: "bg-primary/25" },
  { label: "Worked", swatch: "bg-gradient-to-br from-[hsl(186_100%_78%)] to-[hsl(194_92%_42%)] shadow-[0_0_6px_hsl(var(--primary)/0.6)]" },
  { label: "Pending review", swatch: "bg-gradient-to-br from-[hsl(44_100%_72%)] to-[hsl(32_90%_45%)]" },
  { label: "Approved overtime", swatch: "bg-gradient-to-br from-[hsl(262_100%_82%)] to-[hsl(262_70%_50%)]" },
  { label: "Unapproved extra", swatch: "bg-[repeating-linear-gradient(90deg,hsl(var(--danger))_0_3px,transparent_3px_5px)]" },
];

export function TimelineLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] text-muted-foreground">
      <span className="text-foreground/80">Each dial is a 24-hour clock, midnight at the top.</span>
      {LEGEND.map((l) => (
        <span key={l.label} className="flex items-center gap-1.5">
          <span className={cn("h-1.5 w-4 rounded-full", l.swatch)} /> {l.label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-0.5 rounded bg-danger" /> Auto-stop
      </span>
    </div>
  );
}
