"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

// Monogram in a domed disc, wrapped in the same raised-tube ring the shift
// dial uses. The ring shows how complete the profile is; the dot shows
// whether the person is working right now.

export type Presence = "working" | "scheduled" | "leave" | "off";

const PRESENCE: Record<Presence, { color: string; label: string }> = {
  working: { color: "hsl(var(--success))", label: "Working now" },
  scheduled: { color: "hsl(var(--warning))", label: "Scheduled today" },
  leave: { color: "hsl(var(--info))", label: "On leave" },
  off: { color: "hsl(215 20% 45%)", label: "Off today" },
};

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function PersonAvatar({
  name,
  size = 56,
  ring,
  presence,
  className,
}: {
  name: string;
  size?: number;
  /** 0–100; omit for no progress arc. */
  ring?: number;
  presence?: Presence;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const r = 44;
  const c = 2 * Math.PI * r;
  const pct = ring === undefined ? null : Math.max(0, Math.min(100, ring));
  // Hue drifts with the name so a grid of people isn't one flat colour.
  const hue = 180 + (Array.from(name).reduce((a, ch) => a + ch.charCodeAt(0), 0) % 50);

  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} className="overflow-visible" aria-hidden="true">
        <defs>
          <radialGradient id={`${id}-dome`} cx="38%" cy="28%" r="80%">
            <stop offset="0%" stopColor={`hsl(${hue} 55% 30%)`} />
            <stop offset="60%" stopColor={`hsl(${hue + 10} 60% 13%)`} />
            <stop offset="100%" stopColor="hsl(224 50% 6%)" />
          </radialGradient>
          <linearGradient id={`${id}-tube`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="hsl(186 100% 78%)" />
            <stop offset="100%" stopColor="hsl(194 92% 42%)" />
          </linearGradient>
          <filter id={`${id}-glow`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id={`${id}-drop`} x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="black" floodOpacity="0.5" />
          </filter>
        </defs>
        <circle cx="50" cy="50" r="49" fill="hsl(224 50% 5%)" filter={`url(#${id}-drop)`} />
        <circle cx="50" cy="50" r={r} fill="none" stroke="hsl(225 55% 3%)" strokeWidth="7" />
        {pct !== null && pct > 0 && (
          <g transform="rotate(-90 50 50)">
            <circle
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={`url(#${id}-tube)`}
              strokeWidth="5.5"
              strokeLinecap="round"
              strokeDasharray={`${(c * pct) / 100} ${c}`}
              filter={`url(#${id}-glow)`}
            />
            <circle cx="50" cy="50" r={r + 1.4} fill="none" stroke="white" strokeOpacity="0.4" strokeWidth="1" strokeLinecap="round" strokeDasharray={`${(c * pct) / 100} ${c}`} />
          </g>
        )}
        <circle cx="50" cy="50" r="38" fill={`url(#${id}-dome)`} />
        <circle cx="50" cy="50" r="38" fill="none" stroke="white" strokeOpacity="0.08" strokeWidth="0.8" />
        <ellipse cx="50" cy="29" rx="20" ry="8" fill="white" opacity="0.06" />
        <text x="50" y="58.5" textAnchor="middle" fontSize="25" fontWeight="600" fill="hsl(210 40% 96%)" className="font-display">
          {initials(name)}
        </text>
      </svg>
      {presence && (
        <span
          title={PRESENCE[presence].label}
          className="absolute bottom-[6%] right-[6%] rounded-full border-2 border-[hsl(var(--card))]"
          style={{
            width: Math.max(9, size * 0.17),
            height: Math.max(9, size * 0.17),
            background: PRESENCE[presence].color,
            boxShadow: presence === "working" ? `0 0 10px ${PRESENCE[presence].color}` : undefined,
          }}
        />
      )}
    </div>
  );
}

export { PRESENCE };
