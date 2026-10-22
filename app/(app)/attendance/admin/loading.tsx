import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

// Mirrors the Team Attendance console: day control, 6 tiles, tabs, roster.
export default function TeamAttendanceLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-96" />
      </div>
      <Skeleton className="h-28 rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[92px] rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-11 rounded-2xl" />
      <SkeletonCard lines={8} />
    </div>
  );
}
