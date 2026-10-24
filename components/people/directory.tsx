"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Cake, LayoutGrid, Mail, Network, Phone, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { IconTooltip } from "@/components/ui/tooltip";
import { inputClass } from "@/components/shared/form-field";
import type { PersonCard } from "@/lib/people/queries";
import { PersonAvatar } from "./person-avatar";

const LOCATION: Record<string, string> = { REMOTE: "Remote", OFFICE: "Office", HYBRID: "Hybrid" };
const ROLE: Record<string, string> = { ADMIN: "Admin", TEAM_LEAD: "Team lead", EMPLOYEE: "Employee" };

type View = "grid" | "org";

export function PeopleDirectory({ people, departments }: { people: PersonCard[]; departments: string[] }) {
  const [query, setQuery] = useState("");
  const [dept, setDept] = useState("");
  const [view, setView] = useState<View>("grid");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter(
      (p) =>
        (!dept || p.department === dept) &&
        (!q || [p.name, p.preferredName, p.jobTitle, p.department, p.email].some((v) => v?.toLowerCase().includes(q)))
    );
  }, [people, query, dept]);

  const groups = useMemo(() => {
    const map = new Map<string, PersonCard[]>();
    for (const p of filtered) {
      const k = p.department ?? "No department yet";
      map.set(k, [...(map.get(k) ?? []), p]);
    }
    return Array.from(map.entries()).sort(([a], [b]) => (a === "No department yet" ? 1 : b === "No department yet" ? -1 : a.localeCompare(b)));
  }, [filtered]);

  const working = people.filter((p) => p.presence === "working").length;
  const onLeave = people.filter((p) => p.presence === "leave").length;
  const birthdays = people.filter((p) => p.birthdayInDays !== null && p.birthdayInDays <= 14).sort((a, b) => a.birthdayInDays! - b.birthdayInDays!);

  return (
    <div className="space-y-6">
      {/* Who's around — the one line a lead reads every morning */}
      <div className="glass flex flex-col gap-4 rounded-2xl px-5 py-4 shadow-card md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex -space-x-3">
            {people
              .filter((p) => p.presence === "working")
              .slice(0, 5)
              .map((p) => (
                <PersonAvatar key={p.id} name={p.name} size={36} presence="working" />
              ))}
          </div>
          <p className="text-sm">
            <span className="font-display text-lg font-semibold tabular-nums">{working}</span>
            <span className="text-muted-foreground"> of {people.length} working now</span>
            {onLeave > 0 && <span className="text-muted-foreground"> · {onLeave} on leave</span>}
          </p>
        </div>
        {birthdays.length > 0 && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Cake className="h-4 w-4 text-accent" />
            {birthdays
              .slice(0, 3)
              .map((p) => `${p.preferredName ?? p.name.split(" ")[0]} ${p.birthdayInDays === 0 ? "today" : `in ${p.birthdayInDays}d`}`)
              .join(", ")}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Search people</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, title or department" className={cn(inputClass, "h-10 pl-9")} />
        </label>
        <div className="flex gap-3">
          <div className="w-48">
            <Select value={dept} onValueChange={setDept} options={[{ value: "", label: "All departments" }, ...departments.map((d) => ({ value: d, label: d }))]} />
          </div>
          <div className="flex rounded-xl border border-border p-0.5" role="group" aria-label="View">
            {(
              [
                ["grid", LayoutGrid, "Cards"],
                ["org", Network, "Org chart"],
              ] as const
            ).map(([v, Icon, label]) => (
              <IconTooltip key={v} label={label}>
                <button
                  type="button"
                  aria-label={label}
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className={cn("rounded-lg p-2 transition-colors", view === v ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}
                >
                  <Icon className="h-4 w-4" />
                </button>
              </IconTooltip>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="glass rounded-2xl px-5 py-12 text-center text-sm text-muted-foreground">Nobody matches “{query}”. Try a first name or a department.</p>
      ) : view === "grid" ? (
        <div className="space-y-8">
          {groups.map(([group, members]) => (
            <section key={group}>
              <h2 className="mb-3 flex items-baseline gap-2 text-sm font-semibold">
                {group}
                <span className="text-xs font-normal text-muted-foreground">{members.length}</span>
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {members.map((p) => (
                  <li key={p.id}>
                    <PersonTile p={p} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <OrgChart people={filtered} />
      )}
    </div>
  );
}

function PersonTile({ p }: { p: PersonCard }) {
  return (
    <div className="glass group relative flex items-center gap-4 rounded-2xl p-4 shadow-card transition-colors hover:border-primary/40">
      <PersonAvatar name={p.name} size={60} ring={p.completeness} presence={p.presence} />
      <div className="min-w-0 flex-1">
        <Link href={`/people/${p.id}`} className="block truncate font-display text-base font-semibold after:absolute after:inset-0 after:rounded-2xl hover:text-primary">
          {p.name}
        </Link>
        <p className="truncate text-sm text-muted-foreground">{p.jobTitle ?? ROLE[p.role] ?? p.role}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground/80">
          {LOCATION[p.workLocation]}
          {p.tenure ? ` · ${p.tenure}` : ""}
        </p>
      </div>
      <div className="relative z-10 flex flex-col gap-1 opacity-70 transition-opacity group-hover:opacity-100">
        <IconTooltip label={`Email ${p.name.split(" ")[0]}`}>
          <a href={`mailto:${p.email}`} aria-label={`Email ${p.name}`} className="rounded-lg p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary">
            <Mail className="h-4 w-4" />
          </a>
        </IconTooltip>
        {p.phone && (
          <IconTooltip label={`Call ${p.name.split(" ")[0]}`}>
            <a href={`tel:${p.phone}`} aria-label={`Call ${p.name}`} className="rounded-lg p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary">
              <Phone className="h-4 w-4" />
            </a>
          </IconTooltip>
        )}
      </div>
    </div>
  );
}

function OrgChart({ people }: { people: PersonCard[] }) {
  const ids = new Set(people.map((p) => p.id));
  const childrenOf = new Map<string, PersonCard[]>();
  const roots: PersonCard[] = [];
  for (const p of people) {
    if (p.managerId && ids.has(p.managerId) && p.managerId !== p.id) childrenOf.set(p.managerId, [...(childrenOf.get(p.managerId) ?? []), p]);
    else roots.push(p);
  }
  const unplaced = roots.filter((r) => !childrenOf.has(r.id));
  const leaders = roots.filter((r) => childrenOf.has(r.id));

  const Node = ({ p, depth }: { p: PersonCard; depth: number }) => (
    <li className="relative">
      <Link
        href={`/people/${p.id}`}
        className="glass relative z-10 inline-flex items-center gap-3 rounded-2xl py-2 pl-2 pr-4 shadow-card transition-colors hover:border-primary/40"
      >
        <PersonAvatar name={p.name} size={40} presence={p.presence} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{p.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{p.jobTitle ?? ROLE[p.role]}</span>
        </span>
      </Link>
      {childrenOf.has(p.id) && depth < 8 && (
        <ul className="ml-6 mt-3 space-y-3 border-l border-primary/25 pl-6">
          {childrenOf.get(p.id)!.map((c) => (
            <li key={c.id} className="relative before:absolute before:-left-6 before:top-7 before:h-px before:w-6 before:bg-primary/25">
              <Node p={c} depth={depth + 1} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );

  return (
    <div className="glass overflow-x-auto rounded-2xl p-6 shadow-card">
      {leaders.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reporting lines yet. Set a manager on someone&apos;s Job tab and the chart builds itself.</p>
      ) : (
        <ul className="space-y-6">
          {leaders.map((p) => (
            <Node key={p.id} p={p} depth={0} />
          ))}
        </ul>
      )}
      {unplaced.length > 0 && (
        <div className="mt-8 border-t border-border/60 pt-5">
          <p className="mb-3 text-xs text-muted-foreground">No manager set</p>
          <ul className="flex flex-wrap gap-3">
            {unplaced.map((p) => (
              <Node key={p.id} p={p} depth={9} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
