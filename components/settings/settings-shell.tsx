"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bell, Building2, ClipboardCheck, Clock3, MessageSquare, Sparkles, UserPlus, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Settings as a two-pane control centre: a grouped section list with live
// status on the left, one section at a time on the right. The server page
// renders every section's content; this shell only decides which is shown
// (deep-linkable via ?section=).

const ICONS: Record<string, LucideIcon> = {
  team: Building2,
  members: Users,
  invites: UserPlus,
  shifts: Clock3,
  checklist: ClipboardCheck,
  ai: Sparkles,
  discord: MessageSquare,
  slack: Bell,
};

export type SettingsSection = {
  id: string;
  group: "Workspace" | "People" | "Integrations";
  label: string;
  description: string;
  status?: { text: string; tone: "ok" | "off" | "warn" | "info" };
  content: React.ReactNode;
  action?: React.ReactNode;
};

const TONE = {
  ok: "bg-success",
  off: "bg-muted-foreground/40",
  warn: "bg-warning",
  info: "bg-primary",
} as const;

export function SettingsShell({ teamName, sections }: { teamName: string; sections: SettingsSection[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const fromUrl = params.get("section");
  const [active, setActive] = useState(sections.find((s) => s.id === fromUrl)?.id ?? sections[0]?.id);

  useEffect(() => {
    if (fromUrl && sections.some((s) => s.id === fromUrl)) setActive(fromUrl);
  }, [fromUrl, sections]);

  function select(id: string) {
    setActive(id);
    router.replace(`${pathname}?section=${id}`, { scroll: false });
  }

  const current = sections.find((s) => s.id === active) ?? sections[0];
  const groups = (["Workspace", "People", "Integrations"] as const)
    .map((g) => ({ group: g, items: sections.filter((s) => s.group === g) }))
    .filter((g) => g.items.length);
  const Icon = ICONS[current.id] ?? Building2;

  return (
    <div className="grid gap-5 lg:grid-cols-[16.5rem_minmax(0,1fr)] lg:items-start">
      {/* Section list — a sticky rail on desktop, a scrolling tab row on phones */}
      <nav aria-label="Settings sections" className="lg:sticky lg:top-6">
        <div className="glass hidden overflow-hidden rounded-2xl shadow-card lg:block">
          <div className="border-b border-border/60 px-5 py-5">
            <p className="font-display text-base font-semibold">{teamName}</p>
            <p className="text-xs text-muted-foreground">Workspace settings</p>
          </div>
          <div className="space-y-5 p-3">
            {groups.map(({ group, items }) => (
              <div key={group}>
                <p className="px-2 pb-1.5 text-[11px] font-medium text-muted-foreground">{group}</p>
                <ul className="space-y-0.5">
                  {items.map((s) => {
                    const ItemIcon = ICONS[s.id] ?? Building2;
                    const isActive = s.id === current.id;
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => select(s.id)}
                          aria-current={isActive ? "page" : undefined}
                          className={cn(
                            "group relative flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm transition-colors",
                            isActive ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                          )}
                        >
                          {isActive && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />}
                          <ItemIcon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                          <span className="min-w-0 flex-1 truncate">{s.label}</span>
                          {s.status && (
                            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <span className={cn("h-1.5 w-1.5 rounded-full", TONE[s.status.tone])} />
                              {s.status.text}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="-mx-3 flex gap-2 overflow-x-auto px-5 pb-1 lg:hidden">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => select(s.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
                s.id === current.id ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground"
              )}
            >
              {s.status && <span className={cn("h-1.5 w-1.5 rounded-full", TONE[s.status.tone])} />}
              {s.label}
            </button>
          ))}
        </div>
      </nav>

      <section className="glass min-w-0 overflow-hidden rounded-2xl shadow-card" aria-labelledby="settings-section-title">
        <header className="relative flex flex-col gap-3 overflow-hidden border-b border-border/60 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-primary/10 blur-3xl"
          />
          <div className="relative flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/25 to-primary/5 text-primary shadow-glow-sm">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <h2 id="settings-section-title" className="font-display text-xl font-semibold">
                {current.label}
              </h2>
              <p className="mt-0.5 max-w-[60ch] text-sm text-muted-foreground">{current.description}</p>
            </div>
          </div>
          {current.action && <div className="relative shrink-0">{current.action}</div>}
        </header>
        <div className="p-5">{current.content}</div>
      </section>
    </div>
  );
}
