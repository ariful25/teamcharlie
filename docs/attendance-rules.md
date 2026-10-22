# Attendance & Overtime Rules

How check-in, check-out, missed punches, approvals and overtime work, and why.
The code that enforces this lives in `lib/attendance/rules.ts` (pure rules,
covered by `scripts/test-attendance-rules.ts`) and `lib/services/attendance.ts`.

## The four kinds of time we keep apart

| Kind | Where it lives | Who sets it |
| --- | --- | --- |
| **Schedule** — when the person was expected to work | `ShiftAssignment` → copied onto the record as `shiftStartAt` / `shiftEndAt` | Admin / team lead (Shift Schedule) |
| **Punches** — what was actually clicked | `actualCheckIn` / `actualCheckOut` (never overwritten) | Employee, server clock |
| **Claims** — what the employee says happened when a punch is missing | `claimedCheckIn` / `claimedCheckOut` / `claimReason`, `reportedCheckOutAt`, `checkInRequestedAt` | Employee |
| **Approved time** — what a lead/admin confirmed | `effectiveCheckIn` / `effectiveCheckOut`, `review = APPROVED` | Team lead / admin |

Paid hours are always computed from approved time (or clean punches), never
from claims, and **overtime is only ever the approved overtime request** —
never "whatever ran past the shift end".

## Rules

1. **Normal shift.** Check in → check out. A clean record needs no review; its
   hours count straight away. Checking in after the scheduled start is late
   (`lateMinutes`).
2. **Forgot to check in, still working.** Press *Check In* — it's recorded now
   and counted as late. If you really started earlier, use *I started earlier*:
   that's a claim; the lead confirms the real times after the shift.
3. **Forgot to check in for a whole shift.** Shows up on Team Attendance as a
   missed shift. The lead enters **both** start and end (never just one) and
   confirms the tasks, or marks the day absent. It counts as a late check-in.
4. **Forgot to check out.** The timer stops automatically after
   **10 hours** (Team setting: auto-stop hours), or at the scheduled end plus
   any approved overtime if that's later, so a legitimate 12-hour shift is never
   cut short. Then:
   - no check-out notification is sent yet;
   - the record is *Needs review*; until a lead confirms it, its hours show as
     **pending**, provisionally *check-in → scheduled end* (scheduled time only,
     never the 10 hours);
   - the employee can still press *Confirm check-out*, which records when they
     actually clicked plus the checkout checklist, and sends the check-out
     notification marked "awaiting review";
   - **the employee cannot check in for their next shift** until a lead
     resolves it. They can press *Request check-in*, which records the time they
     tried (so their real start isn't lost) for the lead to approve.
   - Forgotten check-outs from *before* these rules existed were moved into
     the review queue when this shipped, but they don't lock anyone out
     (`blocksCheckIn` is only set by the new auto-stop).
5. **Resolving.** A team lead or admin opens the record, sets the real start
   **and** end, ticks *Scheduled tasks are complete* (the dialog lists that
   day's tasks and any still open), and approves. Rejecting means "didn't work
   / claim not accepted": only real punches count.
6. **Nobody approves their own attendance or overtime**, except an admin, and
   that approval is labelled *self-approved*.
7. **Overtime must be requested and approved first.** Employees request it
   (date, how long, reason, who asked them to). A lead or admin approves it
   (they can change the minutes) or assigns pre-approved overtime directly.
   On the record, approved overtime credited = the time actually worked after
   the scheduled end, **capped at the approved minutes**. Anything beyond that
   is shown as *unapproved extra* and isn't paid.
   Example: a 9-hour shift, checked out 3 hours late with no approved request →
   9h regular, 0h overtime, 3h unapproved extra.
8. **Company limits:** total working time including overtime should stay
   within 10 hours per day. The approval screen warns when a request would go
   over, but the approver decides. Public-holiday overtime is flagged on the
   request (paid at 2× per policy, otherwise 1.5×).
9. **Every approval, rejection or edit is audited** (`AttendanceAudit`: who,
   when, before → after, note).
10. **Overnight shifts are one shift.** A 20:00 → 06:00 shift is one record,
    dated the day it *starts*. Check-in picks the shift you're actually near
    (up to 4 hours early), so checking in at 23:55 for a midnight shift lands on
    the right day.

## Conflicts found in the requirements, and how they're resolved

| # | Conflict | Resolution |
| --- | --- | --- |
| 1 | "Stop the timer after 10 hours" vs. shifts scheduled longer than 10 hours (e.g. 9 AM–9 PM = 12 h) and approved overtime | Auto-stop at the **later** of check-in + 10 h and scheduled end + approved overtime. |
| 2 | "Count the scheduled time" for a forgotten checkout vs. someone who checked in 2 hours late | Provisional credit is *actual check-in → scheduled end*, not the full schedule, so a late start isn't paid as if on time. The lead confirms the real times anyway. |
| 3 | Admin can edit working time, so how can overtime be detected? | Overtime is never inferred from times. It only comes from an approved overtime request, capped by what was actually worked after the shift. Edits change worked time, not the overtime decision. |
| 4 | Late checkout looks like overtime (e.g. checked out 3 h late) | Shown separately as *unapproved extra*; never paid as overtime without an approved request. |
| 5 | Blocking the next check-in until a lead fixes the missed checkout vs. a night shift with no lead online | Blocked employees can *Request check-in*: the server records the real time they tried, and the lead approves it later. No time is lost and nothing is self-approved. |
| 6 | "Confirm both check-in and checkout" vs. someone claiming an earlier start while still mid-shift | Claims are resolved after the shift ends, when both times are known. The approval form always takes both. |
| 7 | Team leads fixing attendance includes their own | No self-approval for leads; admin self-approval is allowed but labelled. |
| 8 | Editing used to overwrite the original punches | Punches are never overwritten. Approved times are stored separately and audited. |
| 9 | Overtime form allows submitting after the day vs. "must be approved first" | Requests are still accepted after the shift (people forget), but they're marked *submitted after the shift* so the approver sees it. Leads can also pre-assign overtime. |
| 10 | Shift/day confusion on Team Attendance | Every screen states the shift day explicitly (e.g. "Shift of Tue 20 Oct · 20:00 → 06:00 (+1)"), and the review dialog shows the day at the top. |

## Assumption to confirm

Your example said a 9 AM–9 PM schedule should count as 9 hours. That
schedule is 12 hours long. The system credits the **scheduled** duration (12 h
here). If the intent is "never more than 9/10 paid hours per shift
regardless of schedule", that's a one-line policy change in
`lib/attendance/rules.ts`.
