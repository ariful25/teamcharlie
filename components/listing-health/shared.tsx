"use client";

import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ratingTone, scoreTone } from "@/lib/listing-health/tones";

export { categoryBarTone, ratingTone, scoreTone, SEVERITY_TONE } from "@/lib/listing-health/tones";

// Small display pieces shared by the Listing Health pages. Built on the
// app's own Badge/glass styles — no separate visual language.

export function ScoreBadge({ score, label }: { score: number | null; label?: string }) {
  return (
    <Badge tone={scoreTone(score)}>
      {label ? `${label} ` : ""}
      {score === null ? "·" : score}
    </Badge>
  );
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

