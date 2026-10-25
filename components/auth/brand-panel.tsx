"use client";

import { motion } from "framer-motion";
import { Building2, ListChecks, Users } from "lucide-react";
import { PRODUCT_NAME } from "@/lib/brand";

// Shared by /login, /signup and /invite/[token].
export const FEATURES = [
  { icon: Building2, title: "Clients", body: "Every client, property and knowledge base in one place" },
  { icon: ListChecks, title: "Tasks", body: "Keep your whole team aligned, every shift" },
  { icon: Users, title: "Teamwork", body: "Roles, permissions and visibility that fit how you operate" },
];

export function BrandPanel() {
  return (
    <div className="relative hidden overflow-hidden bg-[hsl(222_47%_4%)] lg:flex lg:w-[38.2%] lg:items-center lg:justify-start lg:px-14">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-0 h-[32rem] w-[32rem] rounded-full bg-primary/25 blur-[100px]" />
        <div className="absolute -bottom-24 -right-10 h-[28rem] w-[28rem] rounded-full bg-accent/20 blur-[100px]" />
        <svg className="absolute inset-0 h-full w-full opacity-[0.07]" aria-hidden="true">
          <pattern id="grid" width="36" height="36" patternUnits="userSpaceOnUse">
            <path d="M 36 0 L 0 0 0 36" fill="none" stroke="white" strokeWidth="1" />
          </pattern>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      <motion.div
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 max-w-md"
      >
        <p className="text-xs font-semibold text-primary">Team Operations, Simplified</p>
        <h2 className="mt-3 font-display text-4xl font-semibold leading-tight tracking-tight">
          Great teams run on great operations.
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {PRODUCT_NAME} helps operations teams stay organized and on schedule, with one shared source of truth for
          every client, task, shift and teammate.
        </p>

        <div className="mt-10 space-y-5">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 + i * 0.1 }}
              className="flex items-start gap-3"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 glow-border">
                <f.icon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">{f.title}</p>
                <p className="text-xs text-muted-foreground">{f.body}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
