import { Skeleton } from "@/components/ui/skeleton";

// Mirrors app/(app)/notices/page.tsx: header + "Add Notice" button, then a
// wrapping grid of sticky-note-shaped cards (components/notices/notice-board.tsx).
export default function NoticesLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="aspect-square rounded-2xl p-4">
            <Skeleton className="h-full w-full rounded-2xl" />
          </div>
        ))}
      </div>
    </div>
  );
}
