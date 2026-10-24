import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the profile: identity panel beside tabs + a section (golden split).
export default function PersonLoading() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-3 w-16" />
      <div className="grid gap-8 lg:grid-cols-golden-r">
        <div className="space-y-3 rounded-2xl">
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
