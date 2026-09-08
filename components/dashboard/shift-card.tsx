"use client";

import { useEffect, useState, useTransition } from "react";
import { motion } from "framer-motion";
import { LogIn, LogOut, Timer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatClientTime } from "@/lib/time";

type Props = {
  scheduledCheckIn: string | null;
  scheduledCheckOut: string | null;
  actualCheckIn: string | null; // ISO
  actualCheckOut: string | null; // ISO
  discordCheckInSynced?: boolean;
  discordCheckOutSynced?: boolean;
};

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, "0")}h ${m.toString().padStart(2, "0")}m ${s
    .toString()
    .padStart(2, "0")}s`;
}

export function ShiftCard(props: Props) {
  const [isPending, startTransition] = useTransition();
  const [now, setNow] = useState<number | null>(null);
  const checkedIn = !!props.actualCheckIn && !props.actualCheckOut;
  const completed = !!props.actualCheckIn && !!props.actualCheckOut;

  useEffect(() => {
    setNow(Date.now());
    if (!checkedIn) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [checkedIn]);

  async function handleCheckIn() {
    startTransition(async () => {
      const res = await fetch("/api/attendance/checkin", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Could not check in");
        return;
      }
      toast.success(`Checked in at ${formatClientTime(new Date(data.actualCheckIn))}`);
      window.location.reload();
    });
  }

  async function handleCheckOut() {
    startTransition(async () => {
      const res = await fetch("/api/attendance/checkout", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Could not check out");
        return;
      }
      toast.success("Shift completed. Total hours recorded.");
      window.location.reload();
    });
  }

  const elapsed = props.actualCheckIn && now !== null
    ? formatElapsed(now - new Date(props.actualCheckIn).getTime())
    : "--h --m --s";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass glow-border rounded-2xl p-6"
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your Shift</p>

      {!props.actualCheckIn && (
        <>
          <div className="mt-3 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground">Scheduled Start</p>
              <p className="text-lg font-semibold">{props.scheduledCheckIn ?? "Not scheduled"}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground">Current Time</p>
              <p className="text-lg font-semibold tabular-nums">
                {now === null ? "—" : formatClientTime(new Date(now))}
              </p>
            </div>
          </div>
          <Button
            onClick={handleCheckIn}
            disabled={isPending}
            className="mt-5 w-full"
            size="lg"
          >
            <LogIn className="h-4 w-4" /> Check In
          </Button>
        </>
      )}

      {checkedIn && (
        <>
          <div className="mt-3 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground">Checked In</p>
              <p className="text-lg font-semibold text-success tabular-nums">
                {formatClientTime(new Date(props.actualCheckIn!))}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground">Working Time</p>
              <p className="flex items-center gap-1.5 text-lg font-semibold tabular-nums">
                <Timer className="h-4 w-4 text-primary" /> {elapsed}
              </p>
            </div>
          </div>
          <Button onClick={handleCheckOut} disabled={isPending} variant="danger" className="mt-5 w-full" size="lg">
            <LogOut className="h-4 w-4" /> Check Out
          </Button>
        </>
      )}

      {completed && (
        <div className="mt-3 space-y-1 text-sm">
          <p className="font-semibold text-success">Today&apos;s Shift Completed</p>
          <div className="flex justify-between text-muted-foreground">
            <span>Check-in</span>
            <span className="tabular-nums">{formatClientTime(new Date(props.actualCheckIn!))}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Check-out</span>
            <span className="tabular-nums">{formatClientTime(new Date(props.actualCheckOut!))}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span>Total</span>
            <span className="tabular-nums">{formatElapsed(new Date(props.actualCheckOut!).getTime() - new Date(props.actualCheckIn!).getTime())}</span>
          </div>
        </div>
      )}
    </motion.div>
  );
}
