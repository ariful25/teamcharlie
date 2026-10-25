"use client";

import Link from "next/link";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { IconTooltip } from "@/components/ui/tooltip";
import { formatYmd } from "@/components/ui/date-picker";
import type { ProfileData } from "@/lib/people/queries";
import { PersonAvatar } from "../person-avatar";
import { ROLE, EMPLOYMENT, LOCATION, shown } from "./shared";

export function IdentityPanel({ data }: { data: ProfileData }) {
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

export function ContactButton({ href, label, icon: Icon, external }: { href: string; label: string; icon: typeof Mail; external?: boolean }) {
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
