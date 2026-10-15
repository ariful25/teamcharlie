"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatWeekRange } from "@/lib/time";

export function WeekSelector({ weekStart }: { weekStart: Date }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function go(deltaWeeks: number) {
    const next = new Date(weekStart.getTime() + deltaWeeks * 7 * 24 * 60 * 60 * 1000);
    const params = new URLSearchParams(searchParams.toString());
    params.set("weekStart", next.toISOString().slice(0, 10));
    router.push(`/attendance?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-2 py-1.5">
      <button onClick={() => go(-1)} className="rounded-lg p-1 hover:bg-muted/60">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-[160px] text-center text-sm font-medium">{formatWeekRange(weekStart)}</span>
      <button onClick={() => go(1)} className="rounded-lg p-1 hover:bg-muted/60">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
