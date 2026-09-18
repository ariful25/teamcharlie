import { Skeleton, SkeletonStatRow, SkeletonTable } from "@/components/ui/skeleton";

// Matches components/knowledge-base/knowledge-base-manager.tsx: header with
// action buttons, a 4-up stat row, then the "Prepared Properties" table.
export default function KnowledgeBaseLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-28 rounded-xl" />
          <Skeleton className="h-10 w-32 rounded-xl" />
          <Skeleton className="h-10 w-28 rounded-xl" />
        </div>
      </div>
      <SkeletonStatRow count={4} />
      <SkeletonTable rows={6} columns={6} />
    </div>
  );
}
