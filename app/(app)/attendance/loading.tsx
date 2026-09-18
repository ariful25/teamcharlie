import { Skeleton, SkeletonCard, SkeletonTable } from "@/components/ui/skeleton";

export default function AttendanceLoading() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-10 w-40 rounded-xl" />
      </div>
      <SkeletonTable rows={5} columns={5} />
      <SkeletonCard lines={4} />
    </div>
  );
}
