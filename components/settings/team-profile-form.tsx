"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/shared/form-field";
import { TimezoneSelect } from "@/components/auth/timezone-select";

// Team name + timezone. The timezone drives every "today", due time, shift
// time and attendance calculation for the team (lib/time.ts), so changing it
// is called out explicitly.
export function TeamProfileForm({
  name,
  timezone,
  autoCheckoutHours,
  canEdit,
}: {
  name: string;
  timezone: string;
  autoCheckoutHours: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [teamName, setTeamName] = useState(name);
  const [tz, setTz] = useState(timezone);
  const [hours, setHours] = useState(String(autoCheckoutHours));
  const [saving, setSaving] = useState(false);
  const dirty = teamName.trim() !== name || tz !== timezone || Number(hours) !== autoCheckoutHours;

  if (!canEdit) {
    return (
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Team</span>
          <span className="font-medium">{name}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Timezone</span>
          <span className="font-medium">{timezone}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Auto-stop forgotten check-outs after</span>
          <span className="font-medium">{autoCheckoutHours} hours</span>
        </div>
      </div>
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (tz !== timezone && !confirm(`Change the team timezone to ${tz}? Due times, shifts and attendance will use it from now on.`)) return;
    setSaving(true);
    const res = await fetch("/api/settings/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: teamName.trim(), timezone: tz, autoCheckoutHours: Number(hours) }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Team settings saved");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Could not save team settings");
    }
  }

  return (
    <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
      <Field label="Team name">
        <input value={teamName} onChange={(e) => setTeamName(e.target.value)} required minLength={2} maxLength={60} className={inputClass} />
      </Field>
      <TimezoneSelect value={tz} onChange={setTz} label="Timezone" />
      <Field label="Auto-stop forgotten check-outs after (hours)">
        <input type="number" min={4} max={24} value={hours} onChange={(e) => setHours(e.target.value)} className={inputClass} required />
      </Field>
      <p className="self-end pb-2 text-[11px] text-muted-foreground">
        Never before the scheduled end + approved overtime. Stopped shifts go to a team lead for review.
      </p>
      <div className="sm:col-span-2 flex justify-end">
        <Button type="submit" disabled={!dirty || saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}
