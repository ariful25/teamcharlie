"use client";

import { useEffect, useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { TimeFields } from "./time-picker";

// Themed replacements for the browser's native date / datetime-local inputs,
// whose popups ignore the app's colours (white calendar on a dark app). Values
// are the exact strings the native inputs produce — "yyyy-MM-dd" and
// "yyyy-MM-ddTHH:mm", wall-clock, no timezone — so call sites only swap the
// element. A visually-hidden input keeps `name` (FormData) and `required`
// (browser validation) working.

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Ymd = { y: number; m: number; d: number }; // m is 0-based

const pad = (n: number) => String(n).padStart(2, "0");
const ymdKey = (v: Ymd) => `${v.y}-${pad(v.m + 1)}-${pad(v.d)}`;

function parseYmd(s: string | undefined): Ymd | null {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) };
}

// Calendar maths in UTC so the viewer's own timezone/DST never shifts a day.
const utc = (v: Ymd) => new Date(Date.UTC(v.y, v.m, v.d));
const dayOfWeek = (v: Ymd) => utc(v).getUTCDay();

function todayYmd(): Ymd {
  const n = new Date();
  return { y: n.getFullYear(), m: n.getMonth(), d: n.getDate() };
}

export function formatYmd(s: string | undefined): string | null {
  const v = parseYmd(s);
  return v ? `${DOW[dayOfWeek(v)]}, ${v.d} ${MONTHS[v.m]} ${v.y}` : null;
}

function formatTime(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return "";
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${h >= 12 ? "PM" : "AM"}`;
}

function Calendar({ selected, min, max, onSelect }: { selected: string; min?: string; max?: string; onSelect: (key: string) => void }) {
  const sel = parseYmd(selected);
  const [view, setView] = useState(() => {
    const base = sel ?? parseYmd(min) ?? todayYmd();
    return { y: base.y, m: base.m };
  });
  const today = ymdKey(todayYmd());

  const first: Ymd = { y: view.y, m: view.m, d: 1 };
  const lead = (dayOfWeek(first) + 6) % 7; // Monday-first grid
  const cells = Array.from({ length: 42 }, (_, i) => {
    const date = new Date(Date.UTC(view.y, view.m, 1 - lead + i));
    const v = { y: date.getUTCFullYear(), m: date.getUTCMonth(), d: date.getUTCDate() };
    return { v, key: ymdKey(v), outside: v.m !== view.m };
  });
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(view.y, view.m + delta, 1));
    setView({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
  };

  return (
    <div className="w-[260px]">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" aria-label="Previous month" onClick={() => shift(-1)} className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-primary/15 hover:text-primary">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold">
          {MONTHS_LONG[view.m]} {view.y}
        </span>
        <button type="button" aria-label="Next month" onClick={() => shift(1)} className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-primary/15 hover:text-primary">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w) => (
          <span key={w} className="pb-1 text-[11px] font-medium text-muted-foreground">
            {w}
          </span>
        ))}
        {cells.map(({ v, key, outside }) => {
          const disabled = (min && key < min) || (max && key > max);
          const isSel = key === selected?.slice(0, 10);
          const isToday = key === today;
          return (
            <button
              key={key}
              type="button"
              disabled={!!disabled}
              onClick={() => onSelect(key)}
              aria-label={formatYmd(key) ?? key}
              aria-pressed={isSel}
              className={cn(
                "relative h-8 rounded-lg text-xs tabular-nums transition-colors",
                outside ? "text-muted-foreground/50" : "text-foreground",
                !isSel && "hover:bg-primary/15 hover:text-primary",
                isSel && "bg-primary font-semibold text-primary-foreground shadow-glow-sm",
                isToday && !isSel && "ring-1 ring-primary/50",
                disabled && "cursor-not-allowed opacity-30 hover:bg-transparent hover:text-inherit"
              )}
            >
              {v.d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type BaseProps = {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
};

function usePickerValue(value: string | undefined, defaultValue: string | undefined, onChange?: (v: string) => void) {
  const [current, setCurrent] = useState(value ?? defaultValue ?? "");
  useEffect(() => {
    if (value !== undefined) setCurrent(value);
  }, [value]);
  const set = (next: string) => {
    setCurrent(next);
    onChange?.(next);
  };
  return [current, set] as const;
}

function PickerShell({
  open,
  setOpen,
  display,
  empty,
  disabled,
  className,
  id,
  hiddenInput,
  children,
}: {
  open: boolean;
  setOpen: (o: boolean) => void;
  display: string;
  empty: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
  hiddenInput: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <div className="relative">
        {hiddenInput}
        <PopoverPrimitive.Trigger asChild>
          <button
            id={id}
            type="button"
            disabled={disabled}
            className={cn(
              "flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 px-3 text-left text-sm outline-none transition-all",
              "hover:border-primary/40 hover:bg-muted/60 focus-visible:border-primary/60",
              "data-[state=open]:glow-border data-[state=open]:border-primary/50",
              "disabled:cursor-not-allowed disabled:opacity-50",
              className
            )}
          >
            <span className={cn("truncate tabular-nums", empty && "text-muted-foreground")}>{display}</span>
            <CalendarDays className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-colors", open && "text-primary")} />
          </button>
        </PopoverPrimitive.Trigger>
      </div>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content sideOffset={6} align="start" collisionPadding={12} className="z-[100]" asChild>
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                                transition={{ duration: 0.15, ease: "easeOut" }}
                className="glass glow-border rounded-xl p-4 shadow-card"
                style={{ backgroundColor: "hsl(var(--card) / 0.97)" }}
              >
                {children}
              </motion.div>
            </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function HiddenInput({ name, value, required }: { name?: string; value: string; required?: boolean }) {
  if (!name && !required) return null;
  return (
    <input
      tabIndex={-1}
      aria-hidden="true"
      name={name}
      value={value}
      required={required}
      onChange={() => {}}
      className="pointer-events-none absolute inset-x-0 bottom-0 h-px w-full opacity-0"
    />
  );
}

function Footer({ onClear, onToday, onDone }: { onClear?: () => void; onToday: () => void; onDone: () => void }) {
  return (
    <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-3 text-xs">
      <div className="flex gap-3">
        {onClear && (
          <button type="button" onClick={onClear} className="text-muted-foreground hover:text-foreground">
            Clear
          </button>
        )}
        <button type="button" onClick={onToday} className="text-primary hover:underline">
          Today
        </button>
      </div>
      <button type="button" onClick={onDone} className="rounded-lg bg-primary/15 px-3 py-1.5 font-medium text-primary hover:bg-primary/25">
        Done
      </button>
    </div>
  );
}

/** Date-only picker — value "yyyy-MM-dd". */
export function DatePicker({ name, value, defaultValue, onChange, min, max, required, disabled, placeholder = "Pick a date", className, id }: BaseProps) {
  const [open, setOpen] = useState(false);
  const [current, set] = usePickerValue(value, defaultValue, onChange);
  const pick = (key: string) => {
    set(key);
    setOpen(false);
  };
  return (
    <PickerShell
      open={open}
      setOpen={setOpen}
      display={formatYmd(current) ?? placeholder}
      empty={!current}
      disabled={disabled}
      className={className}
      id={id}
      hiddenInput={<HiddenInput name={name} value={current} required={required} />}
    >
      <Calendar selected={current} min={min} max={max} onSelect={pick} />
      <Footer onClear={required ? undefined : () => pick("")} onToday={() => pick(ymdKey(todayYmd()))} onDone={() => setOpen(false)} />
    </PickerShell>
  );
}

/** Date + time picker — value "yyyy-MM-ddTHH:mm" (same as datetime-local). */
export function DateTimePicker({ name, value, defaultValue, onChange, min, max, required, disabled, placeholder = "Pick date & time", className, id }: BaseProps) {
  const [open, setOpen] = useState(false);
  const [current, set] = usePickerValue(value, defaultValue, onChange);
  const date = current.slice(0, 10);
  const time = current.slice(11, 16) || "09:00";
  const display = date ? `${formatYmd(date)} · ${formatTime(time)}` : placeholder;

  return (
    <PickerShell
      open={open}
      setOpen={setOpen}
      display={display}
      empty={!current}
      disabled={disabled}
      className={className}
      id={id}
      hiddenInput={<HiddenInput name={name} value={current} required={required} />}
    >
      <div className="flex flex-col gap-4 sm:flex-row">
        <Calendar selected={date} min={min?.slice(0, 10)} max={max?.slice(0, 10)} onSelect={(key) => set(`${key}T${time}`)} />
        <div className="flex flex-col justify-center gap-2 border-border/60 sm:border-l sm:pl-4">
          <span className="text-center text-[11px] font-medium text-muted-foreground">Time</span>
          <TimeFields value={time} onChange={(t) => set(`${date || ymdKey(todayYmd())}T${t}`)} />
        </div>
      </div>
      <Footer
        onClear={required ? undefined : () => set("")}
        onToday={() => set(`${ymdKey(todayYmd())}T${time}`)}
        onDone={() => setOpen(false)}
      />
    </PickerShell>
  );
}
