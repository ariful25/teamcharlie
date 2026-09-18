import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

// Matches app/(app)/issues/page.tsx: a stack of flat rows (title + meta
// left, severity badge + status button right), not a table grid.
export default function IssuesLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="glass flex items-center justify-between rounded-2xl p-4 shadow-card">
            <div className="w-2/3">
              <SkeletonText lines={2} />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-8 w-28 rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
