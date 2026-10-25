import { combineDateAndTime } from "@/lib/time";

// When a task is on the active board. Pure — tested in scripts/test-tasks.ts.
//
// - Completed tasks get a short undo window, then leave the board for
//   History (Things / ClickUp-style "move done items out of the way").
// - Recurring tasks that belong to a shift are released when that shift
//   starts (Night 00:00, Morning 08:00, Evening 17:00 …), the way shift
//   checklists work in Connecteam/Jolt. Recurring tasks without a shift, and
//   every one-off task, are on the board from the start of the team's day.
// - A task that hasn't been released yet is never flagged overdue.

export const COMPLETED_GRACE_MS = 5 * 60 * 1000;

type Releasable = {
  recurringTemplateId: string | null;
  date: Date;
  shiftType?: { startTime: string } | null;
};

/** The instant a task joins the board, or null when it's there from the start of its day. */
export function releaseAt(task: Releasable, tz: string): Date | null {
  if (!task.recurringTemplateId || !task.shiftType?.startTime) return null;
  return combineDateAndTime(task.date, task.shiftType.startTime, tz);
}

export type BoardPhase = "board" | "later" | "done";

export function boardPhase(
  task: { status: string; completedAt?: Date | string | null; releaseAt?: Date | string | null },
  now: number
): BoardPhase {
  if (task.status === "COMPLETED") {
    // No timestamp (older data) → treat as done long ago.
    const at = task.completedAt ? new Date(task.completedAt).getTime() : 0;
    return now - at < COMPLETED_GRACE_MS ? "board" : "done";
  }
  if (task.releaseAt && now < new Date(task.releaseAt).getTime()) return "later";
  return "board";
}

/**
 * When a task is actually due. For a task tied to a shift, the due time is
 * its first occurrence at or after the shift starts: an Evening (17:00–01:00)
 * task due "00:30" is due 00:30 the next morning, not 16 hours before the
 * shift begins. Other tasks are due at that clock time on their own day.
 */
export function dueAt(task: { date: Date; dueTime: string | null; shiftType?: { startTime: string } | null }, tz: string): Date | null {
  if (!task.dueTime) return null;
  const due = combineDateAndTime(task.date, task.dueTime, tz);
  if (!task.shiftType?.startTime) return due;
  const start = combineDateAndTime(task.date, task.shiftType.startTime, tz);
  return due.getTime() < start.getTime() ? new Date(due.getTime() + 24 * 60 * 60 * 1000) : due;
}
