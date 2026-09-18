import { Skeleton, SkeletonCardGrid } from "@/components/ui/skeleton";

export default function ClientsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>
      <SkeletonCardGrid count={6} columns={3} />
    </div>
  );
}
