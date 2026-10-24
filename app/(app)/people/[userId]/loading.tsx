import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the profile: identity panel beside tabs + a section (golden split).
export default function PersonLoading() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-3 w-16" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.618fr)]">
        <div className="space-y-4 rounded-2xl">
          <Skeleton className="h-[520px] rounded-2xl" />
        </div>
        <div className="space-y-5">
          <Skeleton className="h-12 rounded-2xl" />
          <Skeleton className="h-[220px] rounded-2xl" />
          <Skeleton className="h-[140px] rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
