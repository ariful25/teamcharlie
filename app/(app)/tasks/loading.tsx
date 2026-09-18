import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";

export default function TasksLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-4 w-64" />
      </div>
      <SkeletonTable rows={6} columns={5} />
    </div>
  );
}
