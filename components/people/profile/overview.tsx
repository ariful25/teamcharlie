"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, inputClass } from "@/components/shared/form-field";
import { hm } from "@/lib/attendance/format";
import type { ProfileData } from "@/lib/people/queries";
import { useMutate, Section, EditButton, Chips, Stat, DialogActions } from "./shared";

export function OverviewTab({ data }: { data: ProfileData }) {
  const { about, access, person, month } = data;
  const [editing, setEditing] = useState(false);
  return (
    <div className="space-y-5">
      <Section title={`About ${about.preferredName ?? person.name.split(" ")[0]}`} action={access.editAbout && <EditButton onClick={() => setEditing(true)} />}>
        <p className="max-w-[68ch] whitespace-pre-line text-sm leading-relaxed text-foreground/90">
          {about.bio ?? <span className="text-muted-foreground/70">{access.self ? "Add a short intro so teammates know what you work on." : "No intro yet."}</span>}
        </p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs text-muted-foreground">Skills</p>
            <Chips items={about.skills} empty="None added" />
          </div>
          <div>
            <p className="mb-2 text-xs text-muted-foreground">Languages</p>
            <Chips items={about.languages} empty="None added" />
          </div>
        </div>
      </Section>

      {month && <MonthStrip data={data} />}
      {editing && <AboutDialog data={data} onClose={() => setEditing(false)} />}
    </div>
  );
}

export function MonthStrip({ data }: { data: ProfileData }) {
  const m = data.month!;
  const paid = m.regularMinutes + m.overtimeMinutes;
  const share = m.scheduledMinutes ? Math.min(100, Math.round((paid / m.scheduledMinutes) * 100)) : null;
  return (
    <Section
      title="This month"
      action={
        <Link href={`/attendance/${data.person.id}`} className="text-xs text-primary hover:underline">
          Full attendance
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Paid hours" value={hm(paid)} hint={share !== null ? `${share}% of scheduled` : undefined} />
        <Stat label="Days worked" value={String(m.daysWorked)} />
        <Stat label="Late" value={String(m.lateCount)} tone={m.lateCount ? "warning" : undefined} />
        <Stat label="Overtime" value={hm(m.overtimeMinutes)} tone={m.overtimeMinutes ? "accent" : undefined} />
      </div>
    </Section>
  );
}

export function AboutDialog({ data, onClose }: { data: ProfileData; onClose: () => void }) {
  const { about, person } = data;
  const { busy, run } = useMutate();
  const [f, setF] = useState({
    preferredName: about.preferredName ?? "",
    bio: about.bio ?? "",
    skills: about.skills.join(", "),
    languages: about.languages.join(", "),
    phone: about.phone ?? "",
    whatsapp: about.whatsapp ?? "",
  });
  const list = (s: string) => Array.from(new Set(s.split(",").map((x) => x.trim()).filter(Boolean)));
  async function save() {
    const ok = await run(
      `/api/people/${person.id}`,
      "PATCH",
      { ...f, skills: list(f.skills), languages: list(f.languages) },
      "Profile updated"
    );
    if (ok) onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Edit about" className="max-w-lg">
        <div className="space-y-3">
          <Field label="Preferred name">
            <input className={inputClass} value={f.preferredName} onChange={(e) => setF({ ...f, preferredName: e.target.value })} placeholder={person.name.split(" ")[0]} />
          </Field>
          <Field label="Short intro">
            <textarea className={cn(inputClass, "min-h-[96px]")} maxLength={600} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} placeholder="What you work on, which clients you cover…" />
          </Field>
          <Field label="Skills (comma separated)">
            <input className={inputClass} value={f.skills} onChange={(e) => setF({ ...f, skills: e.target.value })} placeholder="Guest messaging, Guesty, Pricing" />
          </Field>
          <Field label="Languages (comma separated)">
            <input className={inputClass} value={f.languages} onChange={(e) => setF({ ...f, languages: e.target.value })} placeholder="English, Bangla" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Work phone">
              <input className={inputClass} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="tel" />
            </Field>
            <Field label="WhatsApp">
              <input className={inputClass} value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} inputMode="tel" />
            </Field>
          </div>
          <DialogActions busy={busy} onCancel={onClose} onSave={save} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
