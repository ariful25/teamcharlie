import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

// Mirrors the listing page: header, 6 tiles, issues, 3 cards, reviews.
export default function ListingDetailLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[92px] rounded-2xl" />
        ))}
      </div>
      <SkeletonCard lines={5} />
      <div className="grid gap-3 lg:grid-cols-3">
        <SkeletonCard lines={6} />
        <SkeletonCard lines={5} />
        <SkeletonCard lines={7} />
      </div>
      <SkeletonCard lines={6} />
    </div>
  );
}
