"use client";

import { motion } from "framer-motion";
import { Radar } from "lucide-react";
import { BrandPanel } from "./brand-panel";

// Page frame shared by /signup and /invite/[token]: the same glass card +
// brand panel layout as /login.
export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden flex-1 px-4 py-10 lg:min-h-0 lg:justify-end lg:px-0 lg:py-0">
        <div className="pointer-events-none absolute inset-0 lg:hidden">
          <div className="absolute -top-40 left-1/4 h-96 w-96 rounded-full bg-primary/20 blur-3xl animate-pulse-glow" />
          <div className="absolute bottom-0 right-1/4 h-96 w-96 rounded-full bg-accent/20 blur-3xl animate-pulse-glow" />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="glass glow-border relative z-10 w-full max-w-md rounded-3xl p-8 lg:mr-[8%] lg:max-w-sm xl:mr-[12%]"
        >
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 glow-border">
              <Radar className="h-7 w-7 text-primary" />
            </div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {children}
        </motion.div>
      </div>
      <BrandPanel />
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
      {message}
    </p>
  );
}

export const submitButtonClass =
  "mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-glow transition hover:brightness-110 disabled:opacity-60";
