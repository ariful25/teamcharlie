import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type AttendanceRow = {
  userId: string;
  name: string;
  status: "checked_in" | "late" | "not_checked_in";
  time: string | null;
};

export function AttendanceWidget({ rows }: { rows: AttendanceRow[] }) {
  const checkedInCount = rows.filter((r) => r.status !== "not_checked_in").length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Team Attendance</CardTitle>
        <span className="text-xs text-muted-foreground">
          {checkedInCount} / {rows.length} Checked In
        </span>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((r) => (
          <div key={r.userId} className="flex items-center justify-between text-sm">
            <span>{r.name}</span>
            {r.status === "checked_in" && <Badge tone="success">Checked In {r.time}</Badge>}
            {r.status === "late" && <Badge tone="warning">Late {r.time}</Badge>}
            {r.status === "not_checked_in" && <Badge tone="neutral">Not Checked In</Badge>}
          </div>
        ))}
        <Link href="/attendance" className="mt-2 inline-block text-xs text-primary hover:underline">
          View Attendance →
        </Link>
      </CardContent>
    </Card>
  );
}
