import { prisma } from "@/lib/prisma";
import { startOfWeekMonday, weekDays } from "@/lib/time";

export async function getShiftTypes(teamId: string) {
  return prisma.shiftType.findMany({ where: { teamId, active: true }, orderBy: { startTime: "asc" } });
}

/**
 * Full roster for the week containing `anyDateInWeek`, grouped by shift type, with
 * each employee's 7 day-cells (Mon..Sun) and a daily WORKING headcount — the direct
 * digital equivalent of the team's spreadsheet.
 */
export async function getWeekRoster(teamId: string, anyDateInWeek: Date) {
  const weekStart = startOfWeekMonday(anyDateInWeek);
  const days = weekDays(weekStart);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [shiftTypes, assignments, employees] = await Promise.all([
    getShiftTypes(teamId),
    prisma.shiftAssignment.findMany({
      where: { date: { gte: weekStart, lt: weekEnd }, user: { teamId } },
      include: { user: true, shiftType: true },
    }),
    prisma.user.findMany({ where: { teamId, active: true }, orderBy: { name: "asc" } }),
  ]);

  const employeeIdsInWeek = Array.from(new Set(assignments.map((a) => a.userId)));

  const slimAssignment = (a: (typeof assignments)[number]) => ({
    id: a.id,
    userId: a.userId,
    date: a.date,
    status: a.status,
    shiftTypeId: a.shiftTypeId,
    customStart: a.customStart,
    customEnd: a.customEnd,
    note: a.note,
  });

  // Group by the shift type used for most WORKING days that week. A tie keeps
  // the earliest working-day shift, matching the spreadsheet's left-to-right read.
  const rows = employeeIdsInWeek.map((userId) => {
    const employee = employees.find((e) => e.id === userId);
    const employeeAssignments = days.map((day) => {
      const found = assignments.find((a) => a.userId === userId && a.date.getTime() === day.getTime());
      return found ? slimAssignment(found) : null;
    });
    const workingShiftTypeIds = employeeAssignments
      .filter((a) => a?.status === "WORKING" && a.shiftTypeId)
      .map((a) => a!.shiftTypeId!);
    const primaryShiftTypeId =
      workingShiftTypeIds.reduce<{ id: string | null; counts: Map<string, number> }>(
        (acc, id) => {
          const nextCount = (acc.counts.get(id) ?? 0) + 1;
          acc.counts.set(id, nextCount);
          if (!acc.id || nextCount > (acc.counts.get(acc.id) ?? 0)) acc.id = id;
          return acc;
        },
        { id: null, counts: new Map<string, number>() }
      ).id ??
      employee?.defaultShiftTypeId ??
      null;

    return {
      userId,
      employeeName: employee?.name ?? "Unknown",
      shiftTypeId: primaryShiftTypeId,
      days: employeeAssignments,
    };
  });

  const groupedByShift = shiftTypes.map((st) => ({
    shiftType: { id: st.id, name: st.name, startTime: st.startTime, endTime: st.endTime, colorHex: st.colorHex },
    rows: rows.filter((r) => r.shiftTypeId === st.id),
  }));
  const unassignedRows = rows.filter((r) => !shiftTypes.some((st) => st.id === r.shiftTypeId));

  const dailyWorkingCount = days.map(
    (day) => assignments.filter((a) => a.date.getTime() === day.getTime() && a.status === "WORKING").length
  );

  return {
    weekStart,
    days,
    shiftTypes: shiftTypes.map((st) => ({
      id: st.id,
      name: st.name,
      startTime: st.startTime,
      endTime: st.endTime,
      colorHex: st.colorHex,
    })),
    groupedByShift,
    unassignedRows,
    dailyWorkingCount,
    allEmployees: employees.map((e) => ({ id: e.id, name: e.name })),
    hasAnyAssignments: assignments.length > 0,
  };
}

/** Assigns an employee to a shift type for an entire week (Mon..Sun), all days
 * defaulted to WORKING with that shift's times — matches filling in a new
 * spreadsheet row. Existing assignments for that employee/week are left untouched
 * for days already set; only missing days are created. */
export async function assignEmployeeToWeek(
  userId: string,
  shiftTypeId: string,
  anyDateInWeek: Date,
  createdBy: string
) {
  const weekStart = startOfWeekMonday(anyDateInWeek);
  const days = weekDays(weekStart);

  const existing = await prisma.shiftAssignment.findMany({
    where: { userId, date: { in: days } },
    select: { date: true },
  });
  const existingDates = new Set(existing.map((e) => e.date.getTime()));

  const toCreate = days.filter((d) => !existingDates.has(d.getTime()));
  if (toCreate.length > 0) {
    await prisma.$transaction(
      toCreate.map((date) =>
        prisma.shiftAssignment.create({
          data: { userId, date, shiftTypeId, status: "WORKING", createdBy },
        })
      )
    );
  }

  return { created: toCreate.length };
}

/** Duplicates the previous week's full roster into the target week, shifting every
 * date forward 7 days — the realistic day-to-day pattern (weeks look like the last
 * one, with a handful of exceptions the admin then edits). Skips days that already
 * have an assignment in the target week. */
export async function copyPreviousWeek(teamId: string, targetWeekAnyDate: Date, createdBy: string) {
  const targetWeekStart = startOfWeekMonday(targetWeekAnyDate);
  const previousWeekStart = new Date(targetWeekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
  const previousWeekEnd = targetWeekStart;

  const previousAssignments = await prisma.shiftAssignment.findMany({
    where: { date: { gte: previousWeekStart, lt: previousWeekEnd }, user: { teamId } },
  });

  if (previousAssignments.length === 0) return { copied: 0 };

  const targetWeekEnd = new Date(targetWeekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const existingTarget = await prisma.shiftAssignment.findMany({
    where: { date: { gte: targetWeekStart, lt: targetWeekEnd }, user: { teamId } },
    select: { userId: true, date: true },
  });
  const existingKey = new Set(existingTarget.map((e) => `${e.userId}::${e.date.getTime()}`));

  const toCreate = previousAssignments
    .map((a) => {
      const newDate = new Date(a.date.getTime() + 7 * 24 * 60 * 60 * 1000);
      return { ...a, newDate };
    })
    .filter((a) => !existingKey.has(`${a.userId}::${a.newDate.getTime()}`));

  if (toCreate.length === 0) return { copied: 0 };

  await prisma.$transaction(
    toCreate.map((a) =>
      prisma.shiftAssignment.create({
        data: {
          userId: a.userId,
          date: a.newDate,
          shiftTypeId: a.shiftTypeId,
          status: a.status,
          customStart: a.customStart,
          customEnd: a.customEnd,
          note: a.note,
          createdBy,
        },
      })
    )
  );

  return { copied: toCreate.length };
}
