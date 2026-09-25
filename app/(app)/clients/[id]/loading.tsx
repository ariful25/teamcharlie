import { Skeleton, SkeletonCard, SkeletonTable } from "@/components/ui/skeleton";

// Mirrors app/(app)/clients/[id]/page.tsx: header, two stacked task-style
// tables, then a two-column row of panel cards (Integrations, Files,
// Google Knowledge Base).
export default function ClientWorkspaceLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-52" />
        </div>
        <Skeleton className="h-10 w-36 rounded-xl" />
      </div>

      <SkeletonTable rows={3} columns={3} />
      <SkeletonTable rows={2} columns={3} />

      <div className="grid gap-6 lg:grid-cols-2">
        <SkeletonCard lines={3} />
        <SkeletonCard lines={3} />
      </div>
    </div>
  );
}
