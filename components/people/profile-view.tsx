"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  Award,
  Briefcase,
  Cake,
  CalendarClock,
  ExternalLink,
  FileText,
  HeartPulse,
  Mail,
  MessageCircle,
  NotebookPen,
  Pencil,
  Phone,
  Plus,
  Trash2,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { IconTooltip } from "@/components/ui/tooltip";
import { DatePicker, formatYmd } from "@/components/ui/date-picker";
import { Field, inputClass } from "@/components/shared/form-field";
import { useTeamTimezone } from "@/components/providers/team-timezone";
import { formatClientDateTime } from "@/lib/time";
import { hm } from "@/lib/attendance/format";
import type { ProfileData } from "@/lib/people/queries";
import { PersonAvatar } from "./person-avatar";

const ROLE: Record<string, string> = { ADMIN: "Admin", TEAM_LEAD: "Team lead", EMPLOYEE: "Employee" };
const EMPLOYMENT: Record<string, string> = { FULL_TIME: "Full-time", PART_TIME: "Part-time", CONTRACT: "Contract", INTERN: "Intern" };
const LOCATION: Record<string, string> = { REMOTE: "Remote", OFFICE: "Office", HYBRID: "Hybrid" };
const BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

type Tab = "overview" | "job" | "personal" | "time" | "documents" | "history";

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong");
  return data;
}

function useMutate() {
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

const shown = (v: string | null | undefined) => v || <span className="text-muted-foreground/60">Not set</span>;

export function ProfileView({ data }: { data: ProfileData }) {
  const { access, person, job, about } = data;
  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: "overview", label: "Overview", show: true },
    { id: "job", label: "Job", show: true },
    { id: "personal", label: "Personal", show: !!data.personal || access.viewEmergency },
    { id: "time", label: "Time & leave", show: !!data.month },
    { id: "documents", label: "Documents", show: access.viewDocuments },
    { id: "history", label: "History", show: true },
  ];
  const [tab, setTab] = useState<Tab>("overview");
  const first = about.preferredName ?? person.name.split(" ")[0];

  return (
    <div className="grid gap-8 lg:grid-cols-golden-r lg:items-start">
      <IdentityPanel data={data} />

      <div className="min-w-0 space-y-5">
        <div role="tablist" aria-label={`${first}'s profile`} className="glass flex gap-1 overflow-x-auto rounded-2xl p-1.5 shadow-card">
          {tabs
            .filter((t) => t.show)
            .map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "shrink-0 rounded-xl px-5 py-2 text-sm transition-colors",
                  tab === t.id ? "bg-primary/15 font-medium text-primary shadow-glow-sm" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                )}
              >
                {t.label}
              </button>
            ))}
        </div>

        {tab === "overview" && <OverviewTab data={data} />}
        {tab === "job" && <JobTab data={data} />}
        {tab === "personal" && <PersonalTab data={data} />}
        {tab === "time" && <TimeTab data={data} />}
        {tab === "documents" && <DocumentsTab data={data} />}
        {tab === "history" && <HistoryTab data={data} />}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- identity */

function IdentityPanel({ data }: { data: ProfileData }) {
  const { person, job, about, access } = data;
  const facts: [string, React.ReactNode][] = [
    ["Manager", job.manager ? <Link href={`/people/${job.manager.id}`} className="text-primary hover:underline">{job.manager.name}</Link> : null],
    ["Department", job.department],
    ["Works", `${EMPLOYMENT[job.employmentType]} · ${LOCATION[job.workLocation]}`],
    ["Started", job.startDate ? `${formatYmd(job.startDate)}${job.tenure ? ` (${job.tenure})` : ""}` : null],
    ["Usual shift", person.defaultShift],
    ["Employee ID", job.employeeCode],
  ];
  const missing = data.completeness < 100 && (access.self || access.editJob);

  return (
    <aside className="glass relative overflow-hidden rounded-2xl shadow-card lg:sticky lg:top-6">
      <div aria-hidden="true" className="pointer-events-none absolute -left-20 -top-28 h-64 w-64 rounded-full bg-primary/15 blur-3xl" />
      <div className="relative flex flex-col items-center px-5 pb-5 pt-8 text-center">
        <PersonAvatar name={person.name} size={128} ring={data.completeness} />
        <h1 className="mt-5 font-display text-3xl font-semibold leading-tight">{person.name}</h1>
        {about.preferredName && about.preferredName !== person.name.split(" ")[0] && (
          <p className="text-sm text-muted-foreground">Goes by {about.preferredName}</p>
        )}
        <p className="mt-1 text-base text-foreground/85">{job.jobTitle ?? <span className="text-muted-foreground">No job title yet</span>}</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <Badge tone="primary">{ROLE[person.role] ?? person.role}</Badge>
          {!person.active && <Badge tone="danger">Deactivated</Badge>}
          {data.personal?.birthdayInDays === 0 && <Badge tone="warning">Birthday today</Badge>}
        </div>

        <div className="mt-5 flex gap-2">
          <ContactButton href={`mailto:${person.email}`} label={`Email ${person.email}`} icon={Mail} />
          {about.phone && <ContactButton href={`tel:${about.phone}`} label={`Call ${about.phone}`} icon={Phone} />}
          {about.whatsapp && (
            <ContactButton href={`https://wa.me/${about.whatsapp.replace(/[^\d]/g, "")}`} label={`WhatsApp ${about.whatsapp}`} icon={MessageCircle} external />
          )}
        </div>
      </div>

      <dl className="relative divide-y divide-border/50 border-t border-border/60 text-sm">
        {facts.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 px-5 py-2.5">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 truncate text-right">{shown(value as string)}</dd>
          </div>
        ))}
        {job.reports.length > 0 && (
          <div className="px-5 py-3">
            <dt className="mb-2 text-muted-foreground">Reports to {person.name.split(" ")[0]}</dt>
            <dd className="flex flex-wrap gap-1.5">
              {job.reports.map((r) => (
                <Link key={r.id} href={`/people/${r.id}`} className="rounded-full border border-border px-2.5 py-0.5 text-xs hover:border-primary/50 hover:text-primary">
                  {r.name}
                </Link>
              ))}
            </dd>
          </div>
        )}
      </dl>

      {missing && (
        <p className="relative border-t border-border/60 px-5 py-3 text-xs text-muted-foreground">
          Profile {data.completeness}% complete. The ring fills as job, contact and personal details are added.
        </p>
      )}
    </aside>
  );
}

function ContactButton({ href, label, icon: Icon, external }: { href: string; label: string; icon: typeof Mail; external?: boolean }) {
  return (
    <IconTooltip label={label}>
      <a
        href={href}
        aria-label={label}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer" : undefined}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-muted/30 text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
      >
        <Icon className="h-4 w-4" />
      </a>
    </IconTooltip>
  );
}

/* ---------------------------------------------------------------- shared */

function Section({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
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

function EditButton({ onClick, label = "Edit" }: { onClick: () => void; label?: string }) {
  return (
    <Button size="sm" variant="ghost" onClick={onClick}>
      <Pencil className="h-3.5 w-3.5" /> {label}
    </Button>
  );
}

function FactGrid({ items }: { items: [string, React.ReactNode][] }) {
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

function Chips({ items, empty }: { items: string[]; empty: string }) {
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

/* ---------------------------------------------------------------- overview */

function OverviewTab({ data }: { data: ProfileData }) {
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

function MonthStrip({ data }: { data: ProfileData }) {
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

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warning" | "accent" | "danger" }) {
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

function AboutDialog({ data, onClose }: { data: ProfileData; onClose: () => void }) {
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

function DialogActions({ busy, onCancel, onSave, label = "Save changes" }: { busy: boolean; onCancel: () => void; onSave: () => void; label?: string }) {
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

/* ---------------------------------------------------------------- job */

function JobTab({ data }: { data: ProfileData }) {
  const { job, access, person, pay } = data;
  const [editing, setEditing] = useState(false);
  return (
    <div className="space-y-5">
      <Section title="Role and reporting" action={access.editJob && <EditButton onClick={() => setEditing(true)} />}>
        <FactGrid
          items={[
            ["Job title", job.jobTitle],
            ["Department", job.department],
            ["Manager", job.manager ? <Link href={`/people/${job.manager.id}`} className="text-primary hover:underline">{job.manager.name}</Link> : null],
            ["App role", ROLE[person.role]],
            ["Employment type", EMPLOYMENT[job.employmentType]],
            ["Work location", LOCATION[job.workLocation]],
            ["Start date", job.startDate ? `${formatYmd(job.startDate)}${job.tenure ? ` · ${job.tenure}` : ""}` : null],
            ["Probation ends", job.probationEndDate ? formatYmd(job.probationEndDate) : null],
            ["Employee ID", job.employeeCode],
            ["Usual shift", person.defaultShift],
          ]}
        />
      </Section>

      {pay && (
        <Section
          title="Pay"
          action={
            access.editJob ? (
              <Link href="/payroll" className="text-xs text-primary hover:underline">
                Change in Payroll
              </Link>
            ) : undefined
          }
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Monthly gross" value={`৳${pay.monthlyGross.toLocaleString("en-US")}`} />
            <Stat label="Basic" value={`৳${Math.round((pay.monthlyGross * pay.basicPercent) / 100).toLocaleString("en-US")}`} hint={`${pay.basicPercent}% of gross`} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Only {access.self ? "you and admins" : "admins and this person"} can see this.</p>
        </Section>
      )}

      {editing && <JobDialog data={data} onClose={() => setEditing(false)} />}
    </div>
  );
}

function JobDialog({ data, onClose }: { data: ProfileData; onClose: () => void }) {
  const { job, person, teammates } = data;
  const { busy, run } = useMutate();
  const [f, setF] = useState({
    jobTitle: job.jobTitle ?? "",
    department: job.department ?? "",
    managerId: job.manager?.id ?? "",
    employmentType: job.employmentType as string,
    workLocation: job.workLocation as string,
    startDate: job.startDate ?? "",
    probationEndDate: job.probationEndDate ?? "",
    employeeCode: job.employeeCode ?? "",
  });
  async function save() {
    const ok = await run(
      `/api/people/${person.id}`,
      "PATCH",
      { ...f, managerId: f.managerId || null, startDate: f.startDate || null, probationEndDate: f.probationEndDate || null },
      "Job details saved"
    );
    if (ok) onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Job details · ${person.name}`} className="max-w-xl">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Job title">
              <input className={inputClass} value={f.jobTitle} onChange={(e) => setF({ ...f, jobTitle: e.target.value })} placeholder="Guest experience associate" />
            </Field>
            <Field label="Department">
              <input className={inputClass} value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} placeholder="Guest operations" />
            </Field>
            <Field label="Manager">
              <Select value={f.managerId} onValueChange={(v) => setF({ ...f, managerId: v })} options={[{ value: "", label: "No manager" }, ...teammates.map((t) => ({ value: t.id, label: t.name }))]} />
            </Field>
            <Field label="Employee ID">
              <input className={inputClass} value={f.employeeCode} onChange={(e) => setF({ ...f, employeeCode: e.target.value })} />
            </Field>
            <Field label="Employment type">
              <Select value={f.employmentType} onValueChange={(v) => setF({ ...f, employmentType: v })} options={Object.entries(EMPLOYMENT).map(([value, label]) => ({ value, label }))} />
            </Field>
            <Field label="Work location">
              <Select value={f.workLocation} onValueChange={(v) => setF({ ...f, workLocation: v })} options={Object.entries(LOCATION).map(([value, label]) => ({ value, label }))} />
            </Field>
            <Field label="Start date">
              <DatePicker value={f.startDate} onChange={(v) => setF({ ...f, startDate: v })} />
            </Field>
            <Field label="Probation ends">
              <DatePicker value={f.probationEndDate} min={f.startDate || undefined} onChange={(v) => setF({ ...f, probationEndDate: v })} />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">Changes are recorded in {person.name.split(" ")[0]}&apos;s history with your name.</p>
          <DialogActions busy={busy} onCancel={onClose} onSave={save} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------------- personal */

function PersonalTab({ data }: { data: ProfileData }) {
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

function PersonalDialog({ data, onClose }: { data: ProfileData; onClose: () => void }) {
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

function ContactDialog({ userId, onClose }: { userId: string; onClose: () => void }) {
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

/* ---------------------------------------------------------------- time */

function LeaveGauge({ label, used, pending, allowance }: { label: string; used: number; pending: number; allowance: number | null }) {
  const left = allowance === null ? null : Math.max(0, allowance - used);
  const r = 34;
  const c = 2 * Math.PI * r;
  const usedPct = allowance ? Math.min(1, used / allowance) : 0;
  const pendPct = allowance ? Math.min(1 - usedPct, pending / allowance) : 0;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/15 p-5">
      <svg viewBox="0 0 80 80" className="h-[72px] w-[72px] shrink-0 -rotate-90" aria-hidden="true">
        <circle cx="40" cy="40" r={r} fill="none" stroke="hsl(225 55% 3%)" strokeWidth="8" />
        {allowance !== null && (
          <>
            <circle cx="40" cy="40" r={r} fill="none" stroke="hsl(var(--primary))" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${c * (1 - usedPct - pendPct)} ${c}`} strokeDashoffset={-c * (usedPct + pendPct)} style={{ filter: "drop-shadow(0 0 3px hsl(var(--primary) / 0.7))" }} />
            {pendPct > 0 && <circle cx="40" cy="40" r={r} fill="none" stroke="hsl(var(--warning))" strokeWidth="6" strokeDasharray={`${c * pendPct} ${c}`} strokeDashoffset={-c * usedPct} />}
          </>
        )}
      </svg>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-display text-2xl font-semibold tabular-nums">
          {left === null ? used : left}
          <span className="ml-1 text-sm font-normal text-muted-foreground">{left === null ? "taken" : `of ${allowance} left`}</span>
        </p>
        {pending > 0 && <p className="text-xs text-warning">{pending} waiting for approval</p>}
      </div>
    </div>
  );
}

function TimeTab({ data }: { data: ProfileData }) {
  return (
    <div className="space-y-5">
      <MonthStrip data={data} />
      {data.leave && (
        <Section
          title={`Leave in ${data.today.slice(0, 4)}`}
          action={
            data.access.self ? (
              <Link href="/attendance" className="text-xs text-primary hover:underline">
                Request leave
              </Link>
            ) : undefined
          }
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <LeaveGauge label="Paid leave" {...data.leave.PAID} />
            <LeaveGauge label="Sick leave" {...data.leave.SICK} />
            <LeaveGauge label="Unpaid leave" {...data.leave.UNPAID} />
          </div>
        </Section>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- documents */

const DOC_KINDS = ["Contract", "ID", "Certificate", "Policy", "Other"];

function DocumentsTab({ data }: { data: ProfileData }) {
  const { documents, access, person, today } = data;
  const [adding, setAdding] = useState(false);
  const { busy, run } = useMutate();
  const soon = new Date(`${today}T00:00:00Z`).getTime() + 30 * 86_400_000;
  return (
    <Section
      title="Documents"
      action={
        access.addDocuments ? (
          <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" /> Add link
          </Button>
        ) : undefined
      }
    >
      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">Keep contracts, ID copies and certificates in Google Drive and link them here, so they&apos;re one click away.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {documents.map((d) => {
            const expired = d.expiresAt && d.expiresAt < today;
            const expiring = !expired && d.expiresAt && new Date(`${d.expiresAt}T00:00:00Z`).getTime() <= soon;
            return (
              <li key={d.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <FileText className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1.5 truncate text-sm font-medium hover:text-primary">
                    {d.title} <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                  <p className="text-xs text-muted-foreground">
                    {d.kind}
                    {d.expiresAt && (
                      <span className={cn(expired && "text-danger", expiring && "text-warning")}>
                        {" "}· {expired ? "expired" : "expires"} {formatYmd(d.expiresAt)}
                      </span>
                    )}
                  </p>
                </div>
                {d.canDelete && (
                  <IconTooltip label="Remove link">
                    <button
                      aria-label={`Remove ${d.title}`}
                      disabled={busy}
                      onClick={() => confirm(`Remove “${d.title}”? The file itself stays where it is.`) && run(`/api/people/${person.id}/items?type=document&id=${d.id}`, "DELETE", undefined, "Link removed")}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </IconTooltip>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {adding && <DocumentDialog userId={person.id} onClose={() => setAdding(false)} />}
    </Section>
  );
}

function DocumentDialog({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { busy, run } = useMutate();
  const [f, setF] = useState({ title: "", kind: "Contract", url: "", expiresAt: "" });
  async function save() {
    if (await run(`/api/people/${userId}/items`, "POST", { type: "document", ...f, expiresAt: f.expiresAt || null }, "Link added")) onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Add document link" className="max-w-md">
        <div className="space-y-3">
          <Field label="Title">
            <input className={inputClass} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Employment contract 2026" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type">
              <Select value={f.kind} onValueChange={(v) => setF({ ...f, kind: v })} options={DOC_KINDS.map((k) => ({ value: k, label: k }))} />
            </Field>
            <Field label="Expires (optional)">
              <DatePicker value={f.expiresAt} onChange={(v) => setF({ ...f, expiresAt: v })} />
            </Field>
          </div>
          <Field label="Link">
            <input className={inputClass} value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://drive.google.com/…" />
          </Field>
          <DialogActions busy={busy} onCancel={onClose} onSave={save} label="Add link" />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------------- history */

const EVENT_META = {
  JOINED: { icon: CalendarClock, tone: "text-primary bg-primary/10", label: "Joined" },
  JOB_CHANGE: { icon: Briefcase, tone: "text-info bg-info/10", label: "Job change" },
  PRAISE: { icon: Award, tone: "text-success bg-success/10", label: "Praise" },
  NOTE: { icon: NotebookPen, tone: "text-muted-foreground bg-muted/40", label: "Note" },
  WARNING: { icon: AlertTriangle, tone: "text-warning bg-warning/10", label: "Warning" },
} as const;

function HistoryTab({ data }: { data: ProfileData }) {
  const tz = useTeamTimezone();
  const { events, access, person } = data;
  const [adding, setAdding] = useState<"PRAISE" | "NOTE" | "WARNING" | null>(null);
  const { busy, run } = useMutate();
  return (
    <Section
      title="History"
      action={
        <div className="flex gap-1">
          {access.addPraise && (
            <Button size="sm" variant="ghost" onClick={() => setAdding("PRAISE")}>
              <Award className="h-3.5 w-3.5" /> Praise
            </Button>
          )}
          {access.addNoteOrWarning && (
            <>
              <Button size="sm" variant="ghost" onClick={() => setAdding("NOTE")}>
                <NotebookPen className="h-3.5 w-3.5" /> Note
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding("WARNING")}>
                <AlertTriangle className="h-3.5 w-3.5" /> Warning
              </Button>
            </>
          )}
        </div>
      }
    >
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">Job changes, praise and notes appear here as they happen.</p>
      ) : (
        <ol className="relative space-y-5 before:absolute before:bottom-2 before:left-[17px] before:top-2 before:w-px before:bg-border">
          {events.map((e) => {
            const meta = EVENT_META[e.kind as keyof typeof EVENT_META];
            const Icon = meta.icon;
            return (
              <li key={e.id} className="relative flex gap-3">
                <span className={cn("relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-4 ring-[hsl(var(--card))]", meta.tone)}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1 pt-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="text-sm font-medium">
                      {e.title}
                      {e.private && <span className="ml-2 text-xs font-normal text-muted-foreground">admins only</span>}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {e.by} · {formatClientDateTime(new Date(e.at), tz)}
                    </span>
                  </div>
                  {e.detail && <p className="mt-1 max-w-[68ch] whitespace-pre-line text-sm text-foreground/85">{e.detail}</p>}
                  {e.changes && (
                    <ul className="mt-2 space-y-1 text-xs">
                      {e.changes.map((c, i) => (
                        <li key={i} className="text-muted-foreground">
                          {c.field}: <span className="line-through opacity-70">{c.from ?? "—"}</span> <span className="text-foreground">{c.to ?? "—"}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {access.viewPrivateEvents && e.kind !== "JOB_CHANGE" && e.kind !== "JOINED" && (
                  <IconTooltip label="Remove entry">
                    <button
                      aria-label="Remove entry"
                      disabled={busy}
                      onClick={() => confirm("Remove this entry?") && run(`/api/people/${person.id}/items?type=event&id=${e.id}`, "DELETE", undefined, "Entry removed")}
                      className="h-fit rounded-lg p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </IconTooltip>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {adding && <EventDialog userId={person.id} kind={adding} name={person.name} onClose={() => setAdding(null)} />}
    </Section>
  );
}

function EventDialog({ userId, kind, name, onClose }: { userId: string; kind: "PRAISE" | "NOTE" | "WARNING"; name: string; onClose: () => void }) {
  const { busy, run } = useMutate();
  const [f, setF] = useState({ title: "", detail: "" });
  const first = name.split(" ")[0];
  const copy = {
    PRAISE: { title: `Praise ${first}`, hint: `${first} can see this.`, ph: "Handled a midnight lockout perfectly" },
    NOTE: { title: `Note about ${first}`, hint: "Only admins can see notes.", ph: "Discussed shift swap for Eid" },
    WARNING: { title: `Warning for ${first}`, hint: "Only admins can see warnings.", ph: "Third missed check-out this month" },
  }[kind];
  async function save() {
    if (await run(`/api/people/${userId}/items`, "POST", { type: "event", kind, ...f }, "Saved to history")) onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={copy.title} className="max-w-md">
        <div className="space-y-3">
          <Field label="Title">
            <input className={inputClass} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={copy.ph} />
          </Field>
          <Field label="Details (optional)">
            <textarea className={cn(inputClass, "min-h-[88px]")} maxLength={1000} value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} />
          </Field>
          <p className="text-xs text-muted-foreground">{copy.hint}</p>
          <DialogActions busy={busy} onCancel={onClose} onSave={save} label="Save" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
