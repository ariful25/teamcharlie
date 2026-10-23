import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";

// Mirrors the payroll page: header + month switcher, tabs, 5 tiles, table.
export default function PayrollLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-9 w-56 rounded-xl" />
      </div>
      <Skeleton className="h-11 rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[92px] rounded-2xl" />
        ))}
      </div>
      <SkeletonTable rows={6} columns={9} />
    </div>
  );
}
