import { Skeleton, SkeletonCard, SkeletonCardGrid } from "@/components/ui/skeleton";

// Mirrors app/(app)/dashboard/page.tsx's real layout: header, a 7-up stat
// row, then a two-column area (client status + today's operations on the
// left, shift/attendance widgets on the right).
export default function DashboardLoading() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="glass rounded-2xl p-5 shadow-card">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-3 h-6 w-10" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-golden">
        <div className="min-w-0 space-y-8">
          <div>
            <Skeleton className="mb-3 h-3 w-28" />
            <SkeletonCardGrid count={3} columns={3} />
          </div>
        </div>
        <div className="space-y-5">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={3} />
        </div>
      </div>
      <SkeletonCard lines={4} />
    </div>
  );
}
