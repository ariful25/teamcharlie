import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { SetupItem } from "@/lib/queries/setup";

/** Same raised-ring language as the shift dial and avatars (no progress bars). */
function ProgressRing({ share, label }: { share: number; label: string }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center" aria-hidden="true">
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
        <circle cx="50" cy="50" r="48" fill="hsl(224 50% 5%)" />
        <circle cx="50" cy="50" r={r} fill="none" stroke="hsl(225 55% 3%)" strokeWidth="9" />
        {share > 0 && (
          <circle cx="50" cy="50" r={r} fill="none" stroke="hsl(var(--primary))" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(c * share) / 100} ${c}`} style={{ filter: "drop-shadow(0 0 3px hsl(var(--primary) / 0.7))" }} />
        )}
      </svg>
      <span className="relative font-display text-[10px] font-semibold tabular-nums">{label}</span>
    </span>
  );
}

/** Admin-only: what's left to set up, each with progress and a link. Gone when done. */
export function SetupChecklist({ items }: { items: SetupItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="glass glow-border rounded-2xl shadow-card" aria-labelledby="setup-title">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 px-5 py-3">
        <h2 id="setup-title" className="text-sm font-semibold">
          Finish setting up
        </h2>
        <span className="text-xs text-muted-foreground">
          {items.length} thing{items.length === 1 ? "" : "s"} left. Each disappears once it&apos;s done.
        </span>
      </header>
      <ul className="divide-y divide-border/60">
        {items.map((i) => {
          const share = i.total ? Math.round((i.done / i.total) * 100) : 0;
          return (
            <li key={i.key}>
              <Link href={i.href} className="group flex items-center gap-5 px-5 py-3 transition-colors hover:bg-muted/20">
                <ProgressRing share={share} label={i.total > 1 ? `${i.done}/${i.total}` : "Off"} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{i.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{i.detail}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
