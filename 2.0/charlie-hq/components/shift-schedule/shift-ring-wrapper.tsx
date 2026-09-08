"use client";

import dynamic from "next/dynamic";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { RingShift, RingChip } from "./shift-ring";

const ShiftRing = dynamic(() => import("./shift-ring"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[340px] w-full items-center justify-center text-sm text-muted-foreground">
      Loading shift ring...
    </div>
  ),
});

export function ShiftRingWrapper({
  shifts,
  chips,
  dayLabel,
  dateLabel,
  onPrevDay,
  onNextDay,
}: {
  shifts: RingShift[];
  chips: RingChip[];
  dayLabel: string;
  dateLabel: string;
  onPrevDay: () => void;
  onNextDay: () => void;
}) {
  return (
    // 3D is a hero visual only — hidden below lg, and the 2D grid underneath always
    // works fully without it, per the app's "3D decorative, 2D operational" rule.
    <Card className="relative hidden overflow-hidden lg:block">
      <button
        onClick={onPrevDay}
        className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/30 p-2 text-white/80 backdrop-blur hover:bg-black/50 hover:text-white"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        onClick={onNextDay}
        className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/30 p-2 text-white/80 backdrop-blur hover:bg-black/50 hover:text-white"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      <ShiftRing shifts={shifts} chips={chips} dayLabel={dayLabel} dateLabel={dateLabel} />
    </Card>
  );
}
