"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Bits shared by the profile tabs.

export const ROLE: Record<string, string> = { ADMIN: "Admin", TEAM_LEAD: "Team lead", EMPLOYEE: "Employee" };
export const EMPLOYMENT: Record<string, string> = { FULL_TIME: "Full-time", PART_TIME: "Part-time", CONTRACT: "Contract", INTERN: "Intern" };
export const LOCATION: Record<string, string> = { REMOTE: "Remote", OFFICE: "Office", HYBRID: "Hybrid" };
export const BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong");
  return data;
}

export function useMutate() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run(url: string, method: string, body: unknown, done: string) {
    setBusy(true);
    try {
      await send(url, method, body);
      toast.success(done);
      router.refresh();
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, run };
}

export const shown = (v: string | null | undefined) => v || <span className="text-muted-foreground/60">Not set</span>;

export function Section({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("glass rounded-2xl shadow-card", className)}>
      <header className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-3.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function EditButton({ onClick, label = "Edit" }: { onClick: () => void; label?: string }) {
  return (
    <Button size="sm" variant="ghost" onClick={onClick}>
      <Pencil className="h-3.5 w-3.5" /> {label}
    </Button>
  );
}

export function FactGrid({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-muted-foreground">{k}</dt>
          <dd className="mt-0.5 text-sm">{v === null || v === undefined || v === "" ? shown(null) : v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Chips({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <p className="text-sm text-muted-foreground/70">{empty}</p>;
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((s) => (
        <li key={s} className="rounded-full border border-primary/25 bg-primary/5 px-3 py-1 text-xs text-foreground/90">
          {s}
        </li>
      ))}
    </ul>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warning" | "accent" | "danger" }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-display text-2xl font-semibold tabular-nums", tone === "warning" && "text-warning", tone === "accent" && "text-accent", tone === "danger" && "text-danger")}>
        {value}
      </p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function DialogActions({ busy, onCancel, onSave, label = "Save changes" }: { busy: boolean; onCancel: () => void; onSave: () => void; label?: string }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button variant="ghost" onClick={onCancel} disabled={busy}>
        Cancel
      </Button>
      <Button onClick={onSave} disabled={busy}>
        {busy ? "Saving…" : label}
      </Button>
    </div>
  );
}
