import type { Tone } from "@/components/ui/badge";

// Colour rules for Listing Health scores, ratings and issues. Plain
// functions (no "use client"), so server pages like the owner portal can use
// them as well as the client components in components/listing-health.

export function scoreTone(score: number | null): Tone {
  if (score === null) return "neutral";
  if (score >= 80) return "success";
  if (score >= 60) return "warning";
  return "danger";
}

export function ratingTone(rating: number | null): string {
  if (rating === null) return "text-muted-foreground";
  if (rating >= 4.8) return "text-success";
  if (rating >= 4.6) return "text-warning";
  return "text-danger";
}

/** Category scores (4.0–5.0 range stretched across the bar so differences show). */
export function categoryBarTone(v: number | null) {
  if (v === null) return "bg-muted";
  if (v >= 4.8) return "bg-success";
  if (v >= 4.6) return "bg-warning";
  return "bg-danger";
}

export const SEVERITY_TONE: Record<string, Tone> = { high: "danger", medium: "warning", low: "neutral" };
