"use client";

import { useId } from "react";

// How much of Airbnb's 14-day review window is left, as the same raised
// tube ring the shift dial and avatars use. Amber under 5 days, red under 2.
export function WindowRing({ daysLeft, size = 44, rating }: { daysLeft: number | null; size?: number; rating?: number | null }) {
  const id = useId().replace(/:/g, "");
  const r = 40;
  const c = 2 * Math.PI * r;
  const done = rating !== null && rating !== undefined;
  const left = daysLeft === null ? null : Math.max(0, Math.min(14, daysLeft));
  const share = done ? rating! / 5 : left === null ? 0 : left / 14;
  const tone = done ? (rating === 5 ? "var(--success)" : rating! >= 4 ? "var(--warning)" : "var(--danger)") : left !== null && left < 2 ? "var(--danger)" : left !== null && left < 5 ? "var(--warning)" : "var(--primary)";
  const label = done ? `${rating}★` : left === null ? "—" : `${left}d`;
  const title = done ? `Reviewed ${rating}★` : left === null ? "No checkout date" : `${left} day${left === 1 ? "" : "s"} left in the review window`;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={title} title={title}>
      <svg viewBox="0 0 100 100" width={size} height={size} className="-rotate-90 overflow-visible">
        <defs>
          <radialGradient id={`${id}-dome`} cx="40%" cy="30%" r="75%">
            <stop offset="0%" stopColor="hsl(218 30% 22%)" />
            <stop offset="100%" stopColor="hsl(224 50% 6%)" />
          </radialGradient>
          <filter id={`${id}-glow`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle cx="50" cy="50" r="48" fill="hsl(224 50% 5%)" />
        <circle cx="50" cy="50" r={r} fill="none" stroke="hsl(225 55% 3%)" strokeWidth="9" />
        {share > 0 && (
          <>
            <circle cx="50" cy="50" r={r} fill="none" stroke={`hsl(${tone})`} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${c * share} ${c}`} filter={`url(#${id}-glow)`} />
            <circle cx="50" cy="50" r={r + 1.8} fill="none" stroke="white" strokeOpacity="0.4" strokeWidth="1.2" strokeLinecap="round" strokeDasharray={`${c * share} ${c}`} />
          </>
        )}
        <circle cx="50" cy="50" r="31" fill={`url(#${id}-dome)`} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-display text-[11px] font-semibold tabular-nums">{label}</span>
    </div>
  );
}
