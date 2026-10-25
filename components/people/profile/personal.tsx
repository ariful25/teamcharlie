"use client";

import { useState } from "react";
import { Cake, HeartPulse, Phone, Trash2, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { IconTooltip } from "@/components/ui/tooltip";
import { DatePicker, formatYmd } from "@/components/ui/date-picker";
import { Field, inputClass } from "@/components/shared/form-field";
import type { ProfileData } from "@/lib/people/queries";
import { BLOOD, useMutate, Section, EditButton, FactGrid, DialogActions } from "./shared";

export function PersonalTab({ data }: { data: ProfileData }) {
  const { personal, access, contacts, person } = data;
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const { busy, run } = useMutate();
  return (
    <div className="space-y-5">
      {personal && (
        <Section title="Personal details" action={access.editPersonal && <EditButton onClick={() => setEditing(true)} />}>
          <FactGrid
            items={[
              ["Personal email", personal.personalEmail],
              [
                "Birthday",
                personal.dateOfBirth ? (
                  <span className="inline-flex items-center gap-2">
                    {formatYmd(personal.dateOfBirth)}
                    {personal.birthdayInDays !== null && personal.birthdayInDays <= 30 && (
                      <span className="inline-flex items-center gap-1 text-xs text-accent">
                        <Cake className="h-3 w-3" />
                        {personal.birthdayInDays === 0 ? "today" : `in ${personal.birthdayInDays} days`}
                      </span>
                    )}
                  </span>
                ) : null,
              ],
              ["Blood group", personal.bloodGroup],
              ["Address", personal.address],
            ]}
          />
          <p className="mt-5 text-xs text-muted-foreground">Visible to {access.self ? "you and admins" : `${person.name.split(" ")[0]} and admins`} only.</p>
        </Section>
      )}

      {access.viewEmergency && (
        <Section
          title="Emergency contacts"
          action={
            access.editEmergency && contacts.length < 5 ? (
              <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
                <UserPlus className="h-3.5 w-3.5" /> Add contact
              </Button>
            ) : undefined
          }
        >
          {contacts.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <HeartPulse className="h-4 w-4 text-danger" />
              {access.self ? "Add someone we can call if something happens during your shift." : "No emergency contact yet."}
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {contacts.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-muted/20 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.relationship}</p>
                    <a href={`tel:${c.phone}`} className="mt-1 inline-block text-sm text-primary hover:underline">
                      {c.phone}
                    </a>
                  </div>
                  {access.editEmergency && (
                    <IconTooltip label="Remove contact">
                      <button
                        aria-label={`Remove ${c.name}`}
                        disabled={busy}
                        onClick={() => confirm(`Remove ${c.name}?`) && run(`/api/people/${person.id}/items?type=contact&id=${c.id}`, "DELETE", undefined, "Contact removed")}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </IconTooltip>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {editing && <PersonalDialog data={data} onClose={() => setEditing(false)} />}
      {adding && <ContactDialog userId={person.id} onClose={() => setAdding(false)} />}
    </div>
  );
}

export function PersonalDialog({ data, onClose }: { data: ProfileData; onClose: () => void }) {
  const p = data.personal!;
  const { busy, run } = useMutate();
  const [f, setF] = useState({ personalEmail: p.personalEmail ?? "", dateOfBirth: p.dateOfBirth ?? "", address: p.address ?? "", bloodGroup: p.bloodGroup ?? "" });
  async function save() {
    const ok = await run(`/api/people/${data.person.id}`, "PATCH", { ...f, dateOfBirth: f.dateOfBirth || null, bloodGroup: f.bloodGroup || null }, "Personal details saved");
    if (ok) onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Edit personal details" className="max-w-lg">
        <div className="space-y-3">
          <Field label="Personal email">
            <input type="email" className={inputClass} value={f.personalEmail} onChange={(e) => setF({ ...f, personalEmail: e.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date of birth">
              <DatePicker value={f.dateOfBirth} max={data.today} onChange={(v) => setF({ ...f, dateOfBirth: v })} />
            </Field>
            <Field label="Blood group">
              <Select value={f.bloodGroup} onValueChange={(v) => setF({ ...f, bloodGroup: v })} options={[{ value: "", label: "Not set" }, ...BLOOD.map((b) => ({ value: b, label: b }))]} />
            </Field>
          </div>
          <Field label="Address">
            <textarea className={cn(inputClass, "min-h-[72px]")} maxLength={300} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
          </Field>
          <DialogActions busy={busy} onCancel={onClose} onSave={save} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ContactDialog({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { busy, run } = useMutate();
  const [f, setF] = useState({ name: "", relationship: "", phone: "" });
  async function save() {
    if (await run(`/api/people/${userId}/items`, "POST", { type: "contact", ...f }, "Contact added")) onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Add emergency contact" className="max-w-md">
        <div className="space-y-3">
          <Field label="Name">
            <input className={inputClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Relationship">
              <input className={inputClass} value={f.relationship} onChange={(e) => setF({ ...f, relationship: e.target.value })} placeholder="Mother, spouse…" />
            </Field>
            <Field label="Phone">
              <input className={inputClass} value={f.phone} inputMode="tel" onChange={(e) => setF({ ...f, phone: e.target.value })} />
            </Field>
          </div>
          <DialogActions busy={busy} onCancel={onClose} onSave={save} label="Add contact" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
