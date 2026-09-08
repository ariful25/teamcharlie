"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { cn } from "@/lib/utils";

const EMPTY_OPTION_VALUE = "__empty_select_value__";

export type SelectOption = {
  value: string;
  label: string;
  /** Optional colored dot, e.g. for priority/status/shift-type options */
  dotColor?: string;
  disabled?: boolean;
};

/**
 * The one dropdown component used everywhere in the app — priority, status, client,
 * employee, category, repeat mode, role, shift type, filters, etc. Built on
 * @radix-ui/react-select for correct keyboard/accessibility behavior, with a
 * glassmorphic visual layer matching the rest of the UI on top.
 */
export function Select({
  value,
  onValueChange,
  options,
  placeholder = "Select...",
  className,
  name,
  disabled,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  name?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  const hasEmptyOption = options.some((option) => option.value === "");
  const radixValue = value === "" && hasEmptyOption ? EMPTY_OPTION_VALUE : value;

  function handleValueChange(nextValue: string) {
    onValueChange(nextValue === EMPTY_OPTION_VALUE ? "" : nextValue);
  }

  return (
    <SelectPrimitive.Root value={radixValue} onValueChange={handleValueChange} open={open} onOpenChange={setOpen} name={name} disabled={disabled}>
      <SelectPrimitive.Trigger
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm outline-none transition-all",
          "hover:border-primary/40 hover:bg-muted/60",
          "data-[state=open]:glow-border data-[state=open]:border-primary/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      >
        <span className="flex items-center gap-2 truncate">
          {selected?.dotColor && (
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: selected.dotColor }} />
          )}
          <SelectPrimitive.Value placeholder={placeholder}>
            {selected?.label ?? placeholder}
          </SelectPrimitive.Value>
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180 text-primary")}
          />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <AnimatePresence>
          {open && (
            <SelectPrimitive.Content position="popper" sideOffset={6} align="start" className="z-[100]" asChild>
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="glass glow-border w-[--radix-select-trigger-width] overflow-hidden rounded-xl p-1 shadow-card"
              >
                <SelectPrimitive.Viewport>
                  {options.map((option, i) => (
                    <SelectPrimitive.Item
                      key={option.value}
                      value={option.value === "" ? EMPTY_OPTION_VALUE : option.value}
                      disabled={option.disabled}
                      className={cn(
                        "relative flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none transition-colors",
                        "data-[highlighted]:bg-primary/15 data-[highlighted]:text-primary",
                        "data-[state=checked]:bg-primary/10 data-[state=checked]:text-primary",
                        "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40"
                      )}
                      style={{ animationDelay: `${i * 20}ms` }}
                    >
                      {option.dotColor && (
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: option.dotColor }} />
                      )}
                      <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                      <SelectPrimitive.ItemIndicator className="ml-auto">
                        <Check className="h-3.5 w-3.5" />
                      </SelectPrimitive.ItemIndicator>
                    </SelectPrimitive.Item>
                  ))}
                </SelectPrimitive.Viewport>
              </motion.div>
            </SelectPrimitive.Content>
          )}
        </AnimatePresence>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
