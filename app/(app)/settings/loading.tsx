import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the settings control centre: title, section rail, one open section.
export default function SettingsLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[16.5rem_minmax(0,1fr)]">
        <Skeleton className="hidden h-[420px] rounded-2xl lg:block" />
        <div className="space-y-3">
          <Skeleton className="h-[92px] rounded-2xl" />
          <Skeleton className="h-[320px] rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
