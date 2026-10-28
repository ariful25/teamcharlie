import { Skeleton, SkeletonCardGrid, SkeletonStatRow } from "@/components/ui/skeleton";

// Shaped like the portal overview: heading, four stat tiles, listing cards.
export default function PortalLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <SkeletonStatRow count={4} />
      <SkeletonCardGrid count={3} columns={3} />
    </div>
  );
}
