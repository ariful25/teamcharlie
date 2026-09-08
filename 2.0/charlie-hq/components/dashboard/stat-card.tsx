"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ListChecks,
  CheckCircle2,
  Clock3,
  AlertOctagon,
  AlertTriangle,
  MessageSquareText,
  Users,
  type LucideIcon,
} from "lucide-react";
import { AnimatedCounter } from "@/components/shared/animated-counter";
import { cn } from "@/lib/utils";

// Server Components cannot pass component/function references as props to Client
// Components (they aren't serializable across the RSC boundary) — that was the cause
// of the dashboard runtime crash. StatCard now takes a plain icon *name* string and
// resolves it to a component locally, inside the client boundary.
const ICONS: Record<string, LucideIcon> = {
  "list-checks": ListChecks,
  "check-circle": CheckCircle2,
  clock: Clock3,
  "alert-octagon": AlertOctagon,
  "alert-triangle": AlertTriangle,
  "message-square": MessageSquareText,
  users: Users,
};

export type StatCardIconName = keyof typeof ICONS;

export function StatCard({
  label,
  value,
  suffix,
  icon,
  href,
  tone = "primary",
}: {
  label: string;
  value: number;
  suffix?: string;
  icon: StatCardIconName;
  href: string;
  tone?: "primary" | "success" | "warning" | "danger" | "info";
}) {
  const Icon = ICONS[icon];
  const toneClasses: Record<string, string> = {
    primary: "text-primary bg-primary/10",
    success: "text-success bg-success/10",
    warning: "text-warning bg-warning/10",
    danger: "text-danger bg-danger/10",
    info: "text-info bg-info/10",
  };

  return (
    <Link href={href}>
      <motion.div
        whileHover={{ y: -3 }}
        className="glass group rounded-2xl p-4 shadow-card transition-shadow hover:shadow-glow-sm cursor-pointer"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", toneClasses[tone])}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3 text-2xl font-semibold tabular-nums">
          <AnimatedCounter value={value} />
          {suffix && <span className="ml-1 text-base text-muted-foreground">{suffix}</span>}
        </div>
      </motion.div>
    </Link>
  );
}
