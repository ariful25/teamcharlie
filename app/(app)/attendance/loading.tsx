import { Skeleton, SkeletonCard, SkeletonTable } from "@/components/ui/skeleton";

// Mirrors app/(app)/attendance/page.tsx: header, shift card + 8 stat tiles,
// recent shifts + overtime, then the week/month tables.
export default function AttendanceLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(300px,380px)_1fr]">
        <Skeleton className="h-72 rounded-2xl" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[92px] rounded-2xl" />
          ))}
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <SkeletonCard lines={6} />
        <SkeletonCard lines={4} />
      </div>
      <SkeletonTable rows={5} columns={8} />
    </div>
  );
}
