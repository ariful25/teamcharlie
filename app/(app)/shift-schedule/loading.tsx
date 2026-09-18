import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";

export default function ShiftScheduleLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-96" />
      </div>
      <SkeletonTable rows={8} columns={8} />
    </div>
  );
}
