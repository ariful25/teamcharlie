"use client";

import { Star } from "lucide-react";
import { Badge, type Tone } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Small display pieces shared by the Listing Health pages. Built on the
// app's own Badge/glass styles — no separate visual language.

export function scoreTone(score: number | null): Tone {
  if (score === null) return "neutral";
  if (score >= 80) return "success";
  if (score >= 60) return "warning";
  return "danger";
}

export function ScoreBadge({ score, label }: { score: number | null; label?: string }) {
  return (
    <Badge tone={scoreTone(score)}>
      {label ? `${label} ` : ""}
      {score === null ? "·" : score}
    </Badge>
  );
}

export function ratingTone(rating: number | null): string {
  if (rating === null) return "text-muted-foreground";
  if (rating >= 4.8) return "text-success";
  if (rating >= 4.6) return "text-warning";
  return "text-danger";
}

export function Rating({ value, className }: { value: number | null; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 font-semibold tabular-nums", ratingTone(value), className)}>
      <Star className="h-3.5 w-3.5 fill-current" />
      {value === null ? "·" : value.toFixed(2)}
    </span>
  );
}

export function Stars({ count }: { count: number }) {
  return (
    <span className="inline-flex" aria-label={`${count} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={cn("h-3.5 w-3.5", i < count ? "fill-warning text-warning" : "text-muted-foreground/40")} />
      ))}
    </span>
  );
}

/** Horizontal bar 0–100% with a label and value. */
export function Bar({ label, value, display, tone = "bg-primary" }: { label: string; value: number; display: string; tone?: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr_56px] items-center gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="h-2 overflow-hidden rounded-full bg-muted/50">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      <span className="text-right tabular-nums">{display}</span>
    </div>
  );
}

/** Category scores (4.0–5.0 range stretched across the bar so differences show). */
export function categoryBarTone(v: number | null) {
  if (v === null) return "bg-muted";
  if (v >= 4.8) return "bg-success";
  if (v >= 4.6) return "bg-warning";
  return "bg-danger";
}

export const SEVERITY_TONE: Record<string, Tone> = { high: "danger", medium: "warning", low: "neutral" };
