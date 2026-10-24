"use client";

import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/utils";
import { useTeamTimezone } from "@/components/providers/team-timezone";
import type { RecordView } from "@/lib/queries/attendance";
import { hm } from "@/lib/attendance/format";

// A 24-hour clock dial for one shift. Midnight is at the top; the dim band is
// the scheduled window, the raised tube is time actually worked (cyan, amber
// while it waits for review), then approved overtime (violet) and unapproved
// extra time (red, dashed). Working the wrong hours is visible at a glance —
// the tube simply sits somewhere else on the clock.

const C = 50;
const R = 37; // centre-line of the tube
const DAY = 1440;

function useNow() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function minuteOfDay(ms: number, tz: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

function point(minute: number, r: number) {
  const a = (minute / DAY) * 2 * Math.PI - Math.PI / 2;
  // Rounded so server and browser render identical attributes (hydration).
  return [Math.round((C + r * Math.cos(a)) * 1000) / 1000, Math.round((C + r * Math.sin(a)) * 1000) / 1000] as const;
}

/** SVG arc from a minute-of-day for `span` minutes, clockwise. */
function arc(start: number, span: number, r: number) {
  const s = Math.min(Math.max(span, 0), DAY - 1);
  const [x0, y0] = point(start, r);
  const [x1, y1] = point(start + s, r);
  return `M ${x0.toFixed(3)} ${y0.toFixed(3)} A ${r} ${r} 0 ${s > DAY / 2 ? 1 : 0} 1 ${x1.toFixed(3)} ${y1.toFixed(3)}`;
}

type Segment = { start: number; span: number; tone: "worked" | "pending" | "overtime" | "extra" };

function segments(v: RecordView, tz: string, now: number | null) {
  const t = (x: string | null) => (x ? new Date(x).getTime() : null);
  const s0 = t(v.shiftStartAt);
  const s1 = t(v.shiftEndAt);
  const w0 = t(v.effectiveCheckIn ?? v.actualCheckIn ?? v.claimedCheckIn ?? v.checkInRequestedAt);
  const w1 =
    t(v.effectiveCheckOut ?? v.actualCheckOut ?? v.claimedCheckOut ?? v.autoClosedAt ?? v.reportedCheckOutAt) ??
    (v.state === "WORKING" ? now : null);
  const pending = v.review === "PENDING";
  const otEnd = s1 !== null ? s1 + v.credit.overtimeMinutes * 60_000 : null;

  const out: Segment[] = [];
  const push = (a: number, b: number, tone: Segment["tone"]) => {
    if (b > a) out.push({ start: minuteOfDay(a, tz), span: (b - a) / 60_000, tone });
  };
  if (w0 !== null && w1 !== null) {
    const base: Segment["tone"] = pending ? "pending" : "worked";
    if (s1 === null || otEnd === null) push(w0, w1, base);
    else {
      push(w0, Math.min(w1, s1), base);
      push(Math.max(w0, s1), Math.min(w1, otEnd), "overtime");
      push(Math.max(w0, otEnd), w1, "extra");
    }
  }
  const schedule = s0 !== null && s1 !== null ? { start: minuteOfDay(s0, tz), span: (s1 - s0) / 60_000 } : null;
  const autoStop = t(v.autoClosedAt);
  const live = v.state === "WORKING" && now !== null ? minuteOfDay(now, tz) : null;
  const sched = schedule?.span ?? 0;
  const pendingLike = v.credit.bucket === "pending";
  const covered = pendingLike || v.credit.bucket === "open" ? Math.min(v.credit.workedMinutes, sched) : v.credit.regularMinutes;
  const pct = sched > 0 ? Math.round((covered / sched) * 100) : null;
  return { out, schedule, autoStop: autoStop !== null ? minuteOfDay(autoStop, tz) : null, live, pct, pendingLike };
}

const TONE: Record<Segment["tone"], { from: string; to: string; glow: string }> = {
  worked: { from: "hsl(186 100% 78%)", to: "hsl(194 92% 42%)", glow: "hsl(var(--primary))" },
  pending: { from: "hsl(44 100% 72%)", to: "hsl(32 90% 45%)", glow: "hsl(var(--warning))" },
  overtime: { from: "hsl(262 100% 82%)", to: "hsl(262 70% 50%)", glow: "hsl(var(--accent))" },
  extra: { from: "hsl(0 100% 74%)", to: "hsl(0 75% 45%)", glow: "hsl(var(--danger))" },
};

export function ShiftDial({ v, size = 76, className }: { v: RecordView; size?: number; className?: string }) {
  const tz = useTeamTimezone();
  const now = useNow();
  const id = useId().replace(/:/g, "");
  const { out, schedule, autoStop, live, pct, pendingLike } = segments(v, tz, now);
  const large = size >= 120;
  const worked = v.credit.regularMinutes + v.credit.overtimeMinutes;
  const label = pct === null ? (out.length ? hm(Math.round(out.reduce((a, s) => a + s.span, 0))) : "—") : `${pct}%`;
  const title = [
    schedule ? `${pct}% of the scheduled shift covered` : "No schedule",
    worked ? `${pendingLike ? "pending" : "paid"} ${hm(worked)}` : null,
    v.credit.extraMinutes ? `${hm(v.credit.extraMinutes)} unapproved` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }} role="img" aria-label={title} title={title}>
      <svg viewBox="0 0 100 100" width={size} height={size} className="overflow-visible">
        <defs>
          <radialGradient id={`${id}-bezel`} cx="35%" cy="28%" r="80%">
            <stop offset="0%" stopColor="hsl(220 32% 24%)" />
            <stop offset="55%" stopColor="hsl(222 42% 11%)" />
            <stop offset="100%" stopColor="hsl(224 50% 5%)" />
          </radialGradient>
          <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(190 80% 85%)" stopOpacity="0.35" />
            <stop offset="50%" stopColor="hsl(190 80% 85%)" stopOpacity="0.04" />
            <stop offset="100%" stopColor="hsl(190 80% 60%)" stopOpacity="0.18" />
          </linearGradient>
          <linearGradient id={`${id}-well`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(225 55% 3%)" />
            <stop offset="100%" stopColor="hsl(222 40% 12%)" />
          </linearGradient>
          <radialGradient id={`${id}-dome`} cx="40%" cy="30%" r="75%">
            <stop offset="0%" stopColor="hsl(218 30% 22%)" />
            <stop offset="70%" stopColor="hsl(222 45% 9%)" />
            <stop offset="100%" stopColor="hsl(224 50% 6%)" />
          </radialGradient>
          {(Object.keys(TONE) as Segment["tone"][]).map((k) => (
            <linearGradient key={k} id={`${id}-${k}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={TONE[k].from} />
              <stop offset="100%" stopColor={TONE[k].to} />
            </linearGradient>
          ))}
          <filter id={`${id}-glow`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="1.8" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id={`${id}-drop`} x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="0" dy="2.5" stdDeviation="2.5" floodColor="black" floodOpacity="0.55" />
          </filter>
        </defs>

        {/* Bezel */}
        <circle cx={C} cy={C} r={48} fill={`url(#${id}-bezel)`} filter={`url(#${id}-drop)`} />
        <circle cx={C} cy={C} r={47.4} fill="none" stroke={`url(#${id}-rim)`} strokeWidth={1.1} />

        {/* Hour ticks */}
        {Array.from({ length: 24 }, (_, h) => {
          const major = h % 6 === 0;
          const [x0, y0] = point(h * 60, major ? 43.2 : 44.4);
          const [x1, y1] = point(h * 60, 46);
          return <line key={h} x1={x0} y1={y0} x2={x1} y2={y1} stroke="hsl(210 40% 96%)" strokeOpacity={major ? 0.45 : 0.16} strokeWidth={major ? 1 : 0.6} strokeLinecap="round" />;
        })}

        {/* Recessed well the tube runs in */}
        <circle cx={C} cy={C} r={R} fill="none" stroke={`url(#${id}-well)`} strokeWidth={10} />
        <circle cx={C} cy={C} r={R - 5} fill="none" stroke="hsl(190 80% 80%)" strokeOpacity={0.06} strokeWidth={0.5} />
        {schedule && <path d={arc(schedule.start, schedule.span, R)} fill="none" stroke="hsl(var(--primary))" strokeOpacity={0.18} strokeWidth={10} />}
        {schedule && (
          <path d={arc(schedule.start, schedule.span, R + 5.6)} fill="none" stroke="hsl(var(--primary))" strokeOpacity={0.55} strokeWidth={0.8} strokeLinecap="round" />
        )}

        {/* Worked time: glowing tube with a specular highlight on top */}
        {out.map((s, i) => (
          <g key={i}>
            <path
              d={arc(s.start, s.span, R)}
              fill="none"
              stroke={`url(#${id}-${s.tone})`}
              strokeWidth={7}
              strokeLinecap="round"
              strokeDasharray={s.tone === "extra" ? "3 2" : undefined}
              filter={`url(#${id}-glow)`}
              style={{ color: TONE[s.tone].glow }}
            />
            {s.tone !== "extra" && <path d={arc(s.start, s.span, R + 1.7)} fill="none" stroke="white" strokeOpacity={0.45} strokeWidth={1.1} strokeLinecap="round" />}
          </g>
        ))}

        {autoStop !== null &&
          (() => {
            const [x0, y0] = point(autoStop, R - 6);
            const [x1, y1] = point(autoStop, R + 7);
            return (
              <g>
                <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="hsl(var(--danger))" strokeWidth={1.6} strokeLinecap="round" />
                <circle cx={x1} cy={y1} r={1.8} fill="hsl(var(--danger))" />
              </g>
            );
          })()}

        {live !== null &&
          (() => {
            const [x, y] = point(live, R);
            return (
              <g>
                <circle cx={x} cy={y} r={5} fill="hsl(var(--primary))" opacity={0.35} className="animate-ping origin-center [transform-box:fill-box]" />
                <circle cx={x} cy={y} r={2.8} fill="white" />
              </g>
            );
          })()}

        {/* Domed centre */}
        <circle cx={C} cy={C} r={27} fill={`url(#${id}-dome)`} />
        <circle cx={C} cy={C} r={27} fill="none" stroke="white" strokeOpacity={0.07} strokeWidth={0.6} />
        <ellipse cx={C} cy={C - 15} rx={14} ry={6} fill="white" opacity={0.05} />

        {large &&
          ["0", "6", "12", "18"].map((h, i) => {
            const [x, y] = point(i * 360, 23);
            return (
              <text key={h} x={x} y={y + 1.6} textAnchor="middle" fontSize={4.4} fill="hsl(215 20% 65%)">
                {h}
              </text>
            );
          })}
        <text
          x={C}
          y={large ? C + 1 : C + 4.5}
          textAnchor="middle"
          className="font-display"
          fontSize={label.length > 4 ? 11 : 13.5}
          fontWeight={600}
          fill={pct === 0 && v.credit.extraMinutes > 0 ? "hsl(var(--danger))" : "hsl(210 40% 96%)"}
        >
          {label}
        </text>
        {large && (
          <text x={C} y={C + 9} textAnchor="middle" fontSize={5} fill="hsl(215 20% 65%)">
            {worked ? `${pendingLike ? "pending" : "paid"} ${hm(worked)}` : "covered"}
          </text>
        )}
      </svg>
    </div>
  );
}
