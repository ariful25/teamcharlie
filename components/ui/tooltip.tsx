"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

// One shared provider at the root (see app/(app)/layout.tsx) keeps every
// tooltip's open/close delay consistent app-wide instead of each call site
// picking its own.
export const TooltipProvider = TooltipPrimitive.Provider;

// Wraps a single icon-only control. `label` is both the visible tooltip
// text and the button's aria-label — one prop instead of two so a tooltip
// can never be added without the accessible name that icon-only buttons
// require, and vice versa.
export function IconTooltip({
  label,
  children,
  side = "top",
}: {
  label: string;
  children: React.ReactElement;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <TooltipPrimitive.Root delayDuration={300}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn(
            "glass z-50 rounded-lg px-2.5 py-1.5 text-xs text-foreground shadow-lg",
            "data-[state=delayed-open]:animate-fade-up"
          )}
        >
          {label}
          <TooltipPrimitive.Arrow className="fill-border" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
