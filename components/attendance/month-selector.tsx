"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function MonthSelector({ year, month }: { year: number; month: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function go(deltaMonths: number) {
    let newMonth = month + deltaMonths;
    let newYear = year;
    if (newMonth < 0) {
      newMonth = 11;
      newYear -= 1;
    } else if (newMonth > 11) {
      newMonth = 0;
      newYear += 1;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", String(newYear));
    params.set("month", String(newMonth));
    router.push(`/attendance?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-2 py-1.5">
      <button onClick={() => go(-1)} className="rounded-lg p-1 hover:bg-muted/60">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-[130px] text-center text-sm font-medium">
        {MONTHS[month]} {year}
      </span>
      <button onClick={() => go(1)} className="rounded-lg p-1 hover:bg-muted/60">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
