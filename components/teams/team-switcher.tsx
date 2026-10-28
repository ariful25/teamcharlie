"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type TeamView = {
  /** Admin and HR pick a team; everyone else just sees theirs. */
  canSwitch: boolean;
  current: string | null;
  squads: { id: string; name: string }[];
};

/** "All teams / Alfa / Bravo / ..." for Admin and HR, the team's name for everyone else. */
export function TeamSwitcher({ view, className }: { view: TeamView; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const currentName = view.squads.find((s) => s.id === view.current)?.name;

  if (!view.canSwitch) {
    return currentName ? <p className={cn("truncate text-xs text-muted-foreground", className)}>Team {currentName}</p> : null;
  }

  async function pick(squadId: string) {
    setBusy(true);
    const res = await fetch("/api/squad-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ squadId: squadId || null }),
    });
    setBusy(false);
    if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "Couldn't switch team");
    router.refresh();
  }

  return (
    <div className={className}>
      <Select
        value={view.current ?? ""}
        onValueChange={pick}
        disabled={busy}
        options={[{ value: "", label: "All teams" }, ...view.squads.map((s) => ({ value: s.id, label: `Team ${s.name}` }))]}
      />
    </div>
  );
}
