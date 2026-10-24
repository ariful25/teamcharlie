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
