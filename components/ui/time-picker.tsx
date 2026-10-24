"use client";

import { useEffect, useRef, useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { ChevronUp, ChevronDown, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

function parse24h(value: string | undefined) {
  if (!value) return null;
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return { h, m };
}

function to24h(hour12: number, minute: number, period: "AM" | "PM") {
  const h = period === "AM" ? (hour12 === 12 ? 0 : hour12) : hour12 === 12 ? 12 : hour12 + 12;
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// A slot-machine-style digit roll — the old value slides out, the new one
// slides in, instead of the number just snapping. Pairs with the stepper
// buttons below to make an all-click, no-scroll time control.
function RollingDigits({ value }: { value: string }) {
  return (
    <span className="relative inline-block h-[1.2em] w-[2.4ch] overflow-hidden text-center">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -16, opacity: 0 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="absolute inset-0"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function Stepper({
  label,
  display,
  onIncrement,
  onDecrement,
}: {
  label: string;
  display: string;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  const repeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopRepeat = () => {
    if (repeatTimer.current) clearInterval(repeatTimer.current);
    repeatTimer.current = null;
  };
  const startRepeat = (fn: () => void) => {
    fn();
    stopRepeat();
    repeatTimer.current = setInterval(fn, 110);
  };
  useEffect(() => stopRepeat, []);

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        aria-label={`Increase ${label}`}
        onMouseDown={() => startRepeat(onIncrement)}
        onMouseUp={stopRepeat}
        onMouseLeave={stopRepeat}
        className="rounded-lg p-1 text-muted-foreground transition hover:bg-primary/15 hover:text-primary active:scale-90"
      >
        <ChevronUp className="h-4 w-4" />
      </button>
      <div className="w-12 rounded-lg bg-muted/40 py-2 text-center font-display text-xl tabular-nums">
        <RollingDigits value={display} />
      </div>
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        onMouseDown={() => startRepeat(onDecrement)}
        onMouseUp={stopRepeat}
        onMouseLeave={stopRepeat}
        className="rounded-lg p-1 text-muted-foreground transition hover:bg-primary/15 hover:text-primary active:scale-90"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Hour/minute steppers + AM/PM toggle on a "HH:MM" 24-hour string. Shared by
 *  TimePicker and DateTimePicker so both popovers look identical. */
export function TimeFields({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const parsed = parse24h(value);
  const hour12 = parsed ? (parsed.h % 12 === 0 ? 12 : parsed.h % 12) : 9;
  const minute = parsed ? parsed.m : 0;
  const period: "AM" | "PM" = parsed ? (parsed.h >= 12 ? "PM" : "AM") : "AM";
  const update = (h: number, m: number, p: "AM" | "PM") => onChange(to24h(h, m, p));

  return (
    <div className="flex items-center justify-center gap-3">
      <Stepper
        label="hour"
        display={String(hour12).padStart(2, "0")}
        onIncrement={() => update(hour12 === 12 ? 1 : hour12 + 1, minute, period)}
        onDecrement={() => update(hour12 === 1 ? 12 : hour12 - 1, minute, period)}
      />
      <span className="pb-6 text-xl font-semibold text-muted-foreground">:</span>
      <Stepper
        label="minute"
        display={String(minute).padStart(2, "0")}
        onIncrement={() => update(hour12, (minute + 1) % 60, period)}
        onDecrement={() => update(hour12, (minute - 1 + 60) % 60, period)}
      />
      <div className="ml-1 flex flex-col overflow-hidden rounded-lg border border-border">
        {(["AM", "PM"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => update(hour12, minute, p)}
            className={cn(
              "px-2 py-1.5 text-xs font-medium transition-colors",
              period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50"
            )}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Click-only time control — pairs of up/down steppers for hour and minute
 * instead of the native `<input type="time">`'s scroll-wheel/tiny-arrow
 * interaction. Drop-in replacement: renders a hidden `name`d input holding
 * the same "HH:MM" 24-hour string the native input produces, so existing
 * `FormData` reads at call sites don't need to change. Supports both
 * uncontrolled (`defaultValue`) and controlled (`value`/`onValueChange`) use.
 */
export function TimePicker({
  name,
  value,
  defaultValue,
  onValueChange,
  placeholder = "Set time",
  className,
  disabled,
}: {
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(value ?? defaultValue ?? "");

  useEffect(() => {
    if (value !== undefined) setCurrent(value);
  }, [value]);

  const parsed = parse24h(current);
  const hour12 = parsed ? (parsed.h % 12 === 0 ? 12 : parsed.h % 12) : 9;
  const minute = parsed ? parsed.m : 0;
  const period: "AM" | "PM" = parsed ? (parsed.h >= 12 ? "PM" : "AM") : "AM";

  function update(next: string) {
    setCurrent(next);
    onValueChange?.(next);
  }

  const display = parsed
    ? `${String(hour12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${period}`
    : placeholder;

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      {name && <input type="hidden" name={name} value={current} readOnly />}
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm outline-none transition-all",
            "hover:border-primary/40 hover:bg-muted/60",
            "data-[state=open]:glow-border data-[state=open]:border-primary/50",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
        >
          <span className={cn("tabular-nums", !parsed && "text-muted-foreground")}>{display}</span>
          <Clock className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-colors", open && "text-primary")} />
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content sideOffset={6} align="start" className="z-[100]" asChild>
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                                transition={{ duration: 0.15, ease: "easeOut" }}
                className="glass glow-border w-auto rounded-xl p-4 shadow-card"
              >
                <TimeFields value={current || "09:00"} onChange={update} />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="mt-3 w-full rounded-lg bg-primary/15 py-1.5 text-xs font-medium text-primary hover:bg-primary/25"
                >
                  Done
                </button>
              </motion.div>
            </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
