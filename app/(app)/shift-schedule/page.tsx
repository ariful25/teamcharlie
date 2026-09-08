import { getCurrentUser } from "@/lib/session";
import { permissions } from "@/lib/auth";
import { getWeekRoster } from "@/lib/services/shift-schedule";
import { ShiftScheduleBoard } from "@/components/shift-schedule/shift-schedule-board";

function serialize(roster: Awaited<ReturnType<typeof getWeekRoster>>) {
  // Dates need to cross the server->client boundary as ISO strings.
  return {
    ...roster,
    weekStart: roster.weekStart.toISOString(),
    days: roster.days.map((d) => d.toISOString()),
    groupedByShift: roster.groupedByShift.map((g) => ({
      ...g,
      rows: g.rows.map((r) => ({
        ...r,
        days: r.days.map((d) => (d ? { ...d, date: d.date.toISOString() } : null)),
      })),
    })),
    unassignedRows: roster.unassignedRows.map((r) => ({
      ...r,
      days: r.days.map((d) => (d ? { ...d, date: d.date.toISOString() } : null)),
    })),
  };
}

export default async function ShiftSchedulePage() {
  const currentUser = await getCurrentUser();
  const roster = await getWeekRoster(currentUser.teamId, new Date());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Shift Schedule</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Team Charlie&apos;s weekly roster — Morning, Evening, Night, and Backup shifts.
        </p>
      </div>

      <ShiftScheduleBoard
        initialRoster={serialize(roster) as any}
        canEdit={permissions.canManageShiftSchedule(currentUser.role)}
      />
    </div>
  );
}
