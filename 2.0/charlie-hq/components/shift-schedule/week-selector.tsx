"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WeekSelector({
  label,
  onPrev,
  onNext,
  onToday,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 rounded-xl border border-border bg-muted/30 px-2 py-1.5">
        <button onClick={onPrev} className="rounded-lg p-1 hover:bg-muted/60">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[150px] text-center text-sm font-medium">{label}</span>
        <button onClick={onNext} className="rounded-lg p-1 hover:bg-muted/60">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <Button variant="secondary" size="sm" onClick={onToday}>
        This Week
      </Button>
    </div>
  );
}
