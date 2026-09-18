import { cn } from "@/lib/utils";

// The base building block every skeleton below composes from — a shimmering
// bar/block shaped by whatever className the caller passes (width, height,
// radius). Never used bare for a whole page; always shaped to match the
// real content it's standing in for (see SKELETON_DESIGN_RULES below).
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-shimmer rounded-lg bg-[length:200%_100%]",
        "bg-[linear-gradient(110deg,hsl(var(--muted))_0%,hsl(var(--muted))_40%,hsl(var(--border))_50%,hsl(var(--muted))_60%,hsl(var(--muted))_100%)]",
        className
      )}
    />
  );
}

// One or more text-line placeholders. The last line defaults to a shorter
// width so a paragraph-shaped skeleton doesn't read as a row of identical
// bars — matches how real wrapped text actually looks.
export function SkeletonText({ lines = 1, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn("h-3.5", i === lines - 1 && lines > 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

export function SkeletonAvatar({ className }: { className?: string }) {
  return <Skeleton className={cn("h-9 w-9 rounded-full", className)} />;
}

export function SkeletonButton({ className }: { className?: string }) {
  return <Skeleton className={cn("h-10 w-24 rounded-xl", className)} />;
}

// Mirrors the shape of the Card component (components/ui/card.tsx) so a
// skeleton card sits exactly where the real card will render — same
// padding, same title-then-body rhythm — instead of a generic gray box.
export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <div className="glass rounded-2xl p-5 shadow-card">
      <Skeleton className="h-4 w-1/2" />
      <div className="mt-3">
        <SkeletonText lines={lines} />
      </div>
    </div>
  );
}

// A row of KPI-stat cards, matching the Dashboard/Knowledge Base stat-strip
// layout (a big number under a small label).
export function SkeletonStatRow({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="glass rounded-2xl p-5 shadow-card">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-7 w-14" />
        </div>
      ))}
    </div>
  );
}

// A table-shaped skeleton — one header-weight row plus `rows` data rows,
// each split into `columns` cells so column widths/spacing roughly track
// the real table instead of one undifferentiated block.
export function SkeletonTable({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="glass overflow-hidden rounded-2xl shadow-card">
      <div className="flex items-center gap-4 border-b border-border/60 px-5 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 border-t border-border/60 px-5 py-4 first:border-0">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} className={cn("h-3.5 flex-1", c === 0 && "max-w-[40%]")} />
          ))}
        </div>
      ))}
    </div>
  );
}

// A grid of card-shaped placeholders — for the Clients grid, Knowledge Base
// property cards, etc. Each card gets a title bar, two body lines, and a
// status-pill-shaped bar to mirror what those cards actually show.
export function SkeletonCardGrid({ count = 6, columns = 3 }: { count?: number; columns?: number }) {
  const colClass = columns === 2 ? "sm:grid-cols-2" : columns === 4 ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-2 xl:grid-cols-3";
  return (
    <div className={cn("grid grid-cols-1 gap-3", colClass)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="glass space-y-3 rounded-2xl p-5 shadow-card">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <SkeletonText lines={2} />
        </div>
      ))}
    </div>
  );
}

// A full dashboard's worth: stat row + a chart-shaped block + a recent-
// activity list — matches app/(app)/dashboard/page.tsx's actual layout.
export function SkeletonDashboard() {
  return (
    <div className="space-y-6">
      <SkeletonStatRow count={4} />
      <div className="glass rounded-2xl p-5 shadow-card">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-4 h-48 w-full rounded-xl" />
      </div>
      <SkeletonTable rows={5} columns={4} />
    </div>
  );
}

// Generic fallback for a page whose specific shape isn't worth a bespoke
// skeleton (e.g. Settings' config panels) — a header bar plus a couple of
// card-shaped sections, still laid out like a real page rather than a
// single centered spinner.
export function SkeletonPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-48" />
        <SkeletonButton />
      </div>
      <SkeletonCard lines={3} />
      <SkeletonCard lines={3} />
    </div>
  );
}
