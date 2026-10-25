"use client";

import Link from "next/link";
import type { ProfileData } from "@/lib/people/queries";
import { Section } from "./shared";
import { MonthStrip } from "./overview";

export function LeaveGauge({ label, used, pending, allowance }: { label: string; used: number; pending: number; allowance: number | null }) {
  const left = allowance === null ? null : Math.max(0, allowance - used);
  const r = 34;
  const c = 2 * Math.PI * r;
  const usedPct = allowance ? Math.min(1, used / allowance) : 0;
  const pendPct = allowance ? Math.min(1 - usedPct, pending / allowance) : 0;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/15 p-5">
      <svg viewBox="0 0 80 80" className="h-[72px] w-[72px] shrink-0 -rotate-90" aria-hidden="true">
        <circle cx="40" cy="40" r={r} fill="none" stroke="hsl(225 55% 3%)" strokeWidth="8" />
        {allowance !== null && (
          <>
            <circle cx="40" cy="40" r={r} fill="none" stroke="hsl(var(--primary))" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${c * (1 - usedPct - pendPct)} ${c}`} strokeDashoffset={-c * (usedPct + pendPct)} style={{ filter: "drop-shadow(0 0 3px hsl(var(--primary) / 0.7))" }} />
            {pendPct > 0 && <circle cx="40" cy="40" r={r} fill="none" stroke="hsl(var(--warning))" strokeWidth="6" strokeDasharray={`${c * pendPct} ${c}`} strokeDashoffset={-c * usedPct} />}
          </>
        )}
      </svg>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-display text-2xl font-semibold tabular-nums">
          {left === null ? used : left}
          <span className="ml-1 text-sm font-normal text-muted-foreground">{left === null ? "taken" : `of ${allowance} left`}</span>
        </p>
        {pending > 0 && <p className="text-xs text-warning">{pending} waiting for approval</p>}
      </div>
    </div>
  );
}

export function TimeTab({ data }: { data: ProfileData }) {
  return (
    <div className="space-y-5">
      <MonthStrip data={data} />
      {data.leave && (
        <Section
          title={`Leave in ${data.today.slice(0, 4)}`}
          action={
            data.access.self ? (
              <Link href="/attendance" className="text-xs text-primary hover:underline">
                Request leave
              </Link>
            ) : undefined
          }
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <LeaveGauge label="Paid leave" {...data.leave.PAID} />
            <LeaveGauge label="Sick leave" {...data.leave.SICK} />
            <LeaveGauge label="Unpaid leave" {...data.leave.UNPAID} />
          </div>
        </Section>
      )}
    </div>
  );
}
