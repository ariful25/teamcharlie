import { Skeleton, SkeletonCard, SkeletonTable } from "@/components/ui/skeleton";

// Mirrors the Listing Health portfolio: header + actions, 6 tiles, 3 cards, table.
export default function ListingHealthLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-10 w-80 rounded-xl" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[92px] rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={6} />
        <SkeletonCard lines={5} />
      </div>
      <SkeletonTable rows={8} columns={8} />
    </div>
  );
}
