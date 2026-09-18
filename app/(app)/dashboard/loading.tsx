import { Skeleton, SkeletonCard, SkeletonCardGrid } from "@/components/ui/skeleton";

// Mirrors app/(app)/dashboard/page.tsx's real layout: header, a 7-up stat
// row, then a two-column area (client status + today's operations on the
// left, shift/attendance widgets on the right).
export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="glass rounded-2xl p-4 shadow-card">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-3 h-6 w-10" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div>
            <Skeleton className="mb-3 h-3 w-28" />
            <SkeletonCardGrid count={3} columns={3} />
          </div>
          <SkeletonCard lines={4} />
        </div>
        <div className="space-y-6">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={3} />
        </div>
      </div>
    </div>
  );
}
