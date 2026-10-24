"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardCheck, Clock3, PlusCircle, ShieldAlert, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { IconTooltip } from "@/components/ui/tooltip";
import { inputClass } from "@/components/shared/form-field";
import { useTeamTimezone } from "@/components/providers/team-timezone";
import { cn } from "@/lib/utils";
import type { OvertimeView, RecordView, ShiftState } from "@/lib/queries/attendance";
import { ReviewDialog, type ReviewTarget } from "./review-dialog";
import { OvertimeDialog } from "./overtime-dialog";
import { LeaveBoard } from "./leave-panel";
import type { LeaveView } from "@/lib/leave/service";
import { Chip, DayBadge, Panel, ShiftTimeline, StatTile, StateChip, TimelineLegend, dayLabel, hm, scheduleLabel, timeIn } from "./ui";
import { DatePicker } from "@/components/ui/date-picker";

type Option = { id: string; name: string };
type Tab = "roster" | "review" | "overtime" | "leave";
type RosterFilter = "ALL" | "WORKING" | "LATE" | "NOT_IN" | "REVIEW" | "OFF";

const DAY = 24 * 60 * 60 * 1000;

function shiftDay(key: string, delta: number) {
  return new Date(new Date(`${key}T00:00:00.000Z`).getTime() + delta * DAY).toISOString().slice(0, 10);
}

function relativeDay(key: string, today: string) {
  const diff = Math.round((new Date(`${key}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / DAY);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  return diff < 0 ? `${-diff} days ago` : `In ${diff} days`;
}

/** One line saying why a shift is in the review queue. */
function reasonFor(v: RecordView, tz: string) {
  switch (v.state) {
    case "AUTO_STOPPED":
      return v.reportedCheckOutAt
        ? `Forgot to check out — timer stopped ${timeIn(v.autoClosedAt, tz)}, pressed check-out ${timeIn(v.reportedCheckOutAt, tz)}`
        : `Forgot to check out — timer stopped at ${timeIn(v.autoClosedAt, tz)}`;
    case "REQUESTED_CHECK_IN":
      return `Locked out by an earlier shift — asked to check in at ${timeIn(v.checkInRequestedAt, tz)}`;
    case "MISSED_SHIFT":
      return "Scheduled but never checked in or out";
    default:
      if (v.claimedCheckIn && v.claimedCheckOut) return `Claims ${timeIn(v.claimedCheckIn, tz)} → ${timeIn(v.claimedCheckOut, tz)}`;
      if (v.claimedCheckIn) return `Claims they started at ${timeIn(v.claimedCheckIn, tz)} (checked in ${timeIn(v.actualCheckIn, tz)})`;
      if (v.claimedCheckOut) return `Claims they finished at ${timeIn(v.claimedCheckOut, tz)}`;
      return "Waiting for confirmation";
  }
}

export function TeamAttendanceConsole({
  day,
  today,
  tab,
  roster,
  queue,
  overtime,
  leave,
  employees,
  leads,
  currentUser,
}: {
  day: string;
  today: string;
  tab: Tab;
  roster: RecordView[];
  queue: RecordView[];
  overtime: { pending: OvertimeView[]; decided: OvertimeView[] };
  leave: { pending: LeaveView[]; recent: LeaveView[] };
  employees: Option[];
  leads: Option[];
  currentUser: { id: string; role: string };
}) {
  const tz = useTeamTimezone();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [navigating, startNav] = useTransition();
  const [filter, setFilter] = useState<RosterFilter>("ALL");
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);

  function go(next: { day?: string; tab?: Tab }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.day) params.set("day", next.day);
    if (next.tab) params.set("tab", next.tab);
    startNav(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  const counts = useMemo(() => {
    const is = (s: ShiftState[]) => roster.filter((r) => s.includes(r.state)).length;
    return {
      scheduled: roster.filter((r) => r.shiftStartAt).length,
      working: is(["WORKING"]),
      late: roster.filter((r) => r.lateMinutes > 0 || r.missedCheckIn).length,
      notIn: is(["LATE_NOT_IN", "MISSED_SHIFT"]),
      review: is(["AUTO_STOPPED", "NEEDS_REVIEW", "REQUESTED_CHECK_IN", "MISSED_SHIFT"]),
    };
  }, [roster]);

  const filtered = roster.filter((r) => {
    switch (filter) {
      case "WORKING":
        return r.state === "WORKING";
      case "LATE":
        return r.lateMinutes > 0 || r.missedCheckIn;
      case "NOT_IN":
        return r.state === "LATE_NOT_IN" || r.state === "MISSED_SHIFT";
      case "REVIEW":
        return ["AUTO_STOPPED", "NEEDS_REVIEW", "REQUESTED_CHECK_IN", "MISSED_SHIFT"].includes(r.state);
      case "OFF":
        return r.state === "OFF" || r.state === "LEAVE";
      default:
        return true;
    }
  });

  const queueByDay = useMemo(() => {
    const groups = new Map<string, RecordView[]>();
    for (const item of queue) groups.set(item.date, [...(groups.get(item.date) ?? []), item]);
    return Array.from(groups.entries());
  }, [queue]);

  const open = (v: RecordView) => setReviewTarget({ recordId: v.id, userId: v.userId, date: v.date });

  return (
    <div className={cn("space-y-6 transition-opacity", navigating && "opacity-60")}>
      {/* Day control — the single most important thing on this page: which day you're on. */}
      <Panel>
        <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-medium text-primary">Viewing shifts of</p>
            <p className="font-display text-2xl font-semibold md:text-3xl">{dayLabel(day, "EEEE, d MMMM yyyy")}</p>
            <div className="mt-1 flex items-center gap-2">
              <Chip tone={day === today ? "success" : "muted"}>
                {relativeDay(day, today)}
              </Chip>
              <span className="text-[11px] text-muted-foreground">Overnight shifts belong to the day they start · {tz}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <IconTooltip label="Previous day">
              <Button variant="outline" size="icon" aria-label="Previous day" onClick={() => go({ day: shiftDay(day, -1) })}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </IconTooltip>
            <div className="w-[180px]">
              <DatePicker value={day} max={shiftDay(today, 7)} onChange={(v) => v && go({ day: v })} className="h-9" />
            </div>
            <IconTooltip label="Next day">
              <Button variant="outline" size="icon" aria-label="Next day" onClick={() => go({ day: shiftDay(day, 1) })}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </IconTooltip>
            {day !== today && (
              <Button variant="secondary" size="sm" onClick={() => go({ day: today })}>
                <CalendarDays className="h-3.5 w-3.5" /> Today
              </Button>
            )}
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Scheduled" value={counts.scheduled} hint={dayLabel(day)} tone="primary" />
        <StatTile label="Working now" value={counts.working} tone={counts.working ? "success" : "muted"} active={tab === "roster" && filter === "WORKING"} onClick={() => { go({ tab: "roster" }); setFilter("WORKING"); }} />
        <StatTile label="Late" value={counts.late} hint="incl. missed check-ins" tone={counts.late ? "warning" : "muted"} active={tab === "roster" && filter === "LATE"} onClick={() => { go({ tab: "roster" }); setFilter("LATE"); }} />
        <StatTile label="Not checked in" value={counts.notIn} tone={counts.notIn ? "danger" : "muted"} active={tab === "roster" && filter === "NOT_IN"} onClick={() => { go({ tab: "roster" }); setFilter("NOT_IN"); }} />
        <StatTile label="Needs review" value={queue.length} hint="all days" tone={queue.length ? "danger" : "muted"} active={tab === "review"} onClick={() => go({ tab: "review" })} />
        <StatTile label="Overtime requests" value={overtime.pending.length} hint="waiting" tone={overtime.pending.length ? "accent" : "muted"} active={tab === "overtime"} onClick={() => go({ tab: "overtime" })} />
      </div>

      <div role="tablist" aria-label="Team attendance views" className="flex flex-wrap gap-1 rounded-2xl border border-border bg-muted/20 p-1">
        {(
          [
            { id: "roster", label: `Roster · ${dayLabel(day)}`, icon: Users },
            { id: "review", label: `Needs review (${queue.length})`, icon: ShieldAlert },
            { id: "overtime", label: `Overtime (${overtime.pending.length})`, icon: Clock3 },
            { id: "leave", label: `Leave (${leave.pending.length})`, icon: CalendarDays },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => go({ tab: t.id })}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition md:flex-none",
              tab === t.id ? "bg-primary/15 text-primary shadow-glow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "roster" && (
        <Panel
          title={`Roster — ${dayLabel(day, "EEEE d MMM")}`}
          action={
            <div className="flex flex-wrap gap-1">
              {(["ALL", "WORKING", "LATE", "NOT_IN", "REVIEW", "OFF"] as RosterFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-[11px] font-medium transition",
                    filter === f ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {{ ALL: "All", WORKING: "Working", LATE: "Late", NOT_IN: "Not in", REVIEW: "Review", OFF: "Off / leave" }[f]}
                </button>
              ))}
            </div>
          }
        >
          <div className="px-5 pt-3">
            <TimelineLegend />
          </div>
          {filtered.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-muted-foreground">Nobody matches this filter on {dayLabel(day)}.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {filtered.map((v) => (
                <li key={v.userId} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(180px,1.2fr)_minmax(220px,2fr)_auto] md:items-center">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 font-semibold text-primary glow-border">
                      {v.userName.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <Link href={`/attendance/${v.userId}`} className="block truncate font-medium hover:text-primary">
                        {v.userName}
                      </Link>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {v.shiftName ? `${v.shiftName} · ` : ""}
                        {v.dayStatus && v.dayStatus !== "WORKING" ? v.dayStatus.replace("_", " ").toLowerCase() : scheduleLabel(v)}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <StateChip state={v.state} />
                      {v.lateMinutes > 0 && <Chip tone="warning">Late {hm(v.lateMinutes)}</Chip>}
                      {v.credit.extraMinutes > 0 && <Chip tone="danger">+{hm(v.credit.extraMinutes)} unapproved</Chip>}
                      {v.overtimeApprovedMinutes > 0 && <Chip tone="accent">OT {hm(v.overtimeApprovedMinutes)}</Chip>}
                    </div>
                    <ShiftTimeline v={v} compact />
                    <p className="flex flex-wrap gap-x-4 text-[11px] text-muted-foreground">
                      <span>In {timeIn(v.effectiveCheckIn ?? v.actualCheckIn, tz)}</span>
                      <span>Out {timeIn(v.effectiveCheckOut ?? v.actualCheckOut, tz)}</span>
                      <span className={v.credit.bucket === "pending" ? "text-warning" : ""}>
                        {v.credit.bucket === "pending" ? "Pending " : "Paid "}
                        {hm(v.credit.regularMinutes + v.credit.overtimeMinutes)}
                      </span>
                    </p>
                  </div>
                  <div className="flex justify-end">
                    {/* No action on a shift that's still running — "Correct" would end it. */}
                    {v.state === "OFF" || v.state === "NOT_STARTED" || v.state === "LEAVE" || v.state === "WORKING" ? (
                      <span className="text-[11px] text-muted-foreground">—</span>
                    ) : (
                      <Button
                        size="sm"
                        variant={["AUTO_STOPPED", "NEEDS_REVIEW", "REQUESTED_CHECK_IN", "MISSED_SHIFT"].includes(v.state) ? "primary" : "outline"}
                        onClick={() => open(v)}
                      >
                        <ClipboardCheck className="h-3.5 w-3.5" />
                        {["AUTO_STOPPED", "NEEDS_REVIEW", "REQUESTED_CHECK_IN", "MISSED_SHIFT"].includes(v.state) ? "Review" : "Correct"}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {tab === "review" && (
        <div className="space-y-4">
          {queueByDay.length === 0 ? (
            <Panel>
              <p className="px-5 py-12 text-center text-sm text-muted-foreground">Nothing to review — every shift is confirmed.</p>
            </Panel>
          ) : (
            queueByDay.map(([date, items]) => (
              <Panel
                key={date}
                title={
                  <div className="flex items-center gap-2">
                    <span className="font-display text-sm font-semibold">{dayLabel(date, "EEEE, d MMMM")}</span>
                    <Chip tone={date === today ? "success" : "muted"}>{relativeDay(date, today)}</Chip>
                  </div>
                }
                action={<span className="text-[11px] text-muted-foreground">{items.length} to review</span>}
              >
                <ul className="divide-y divide-border/60">
                  {items.map((v) => (
                    <li key={`${v.userId}-${v.date}`} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{v.userName}</span>
                          <StateChip state={v.state} />
                          <DayBadge dayKey={v.date} today={today} />
                        </div>
                        <p className="text-xs text-muted-foreground">{reasonFor(v, tz)}</p>
                        <p className=" text-[11px] text-muted-foreground">
                          Schedule {scheduleLabel(v)} · checked in {timeIn(v.actualCheckIn, tz)}
                        </p>
                      </div>
                      {v.userId === currentUser.id && currentUser.role !== "ADMIN" ? (
                        <span className="text-[11px] text-muted-foreground">Your own shift — another lead or an admin reviews it</span>
                      ) : (
                        <Button size="sm" onClick={() => open(v)}>
                          <ClipboardCheck className="h-3.5 w-3.5" /> Review
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </Panel>
            ))
          )}
        </div>
      )}

      {tab === "overtime" && (
        <div className="space-y-4">
          <Panel
            title="Waiting for approval"
            action={
              <Button size="sm" variant="secondary" onClick={() => setAssignOpen(true)}>
                <PlusCircle className="h-3.5 w-3.5" /> Assign overtime
              </Button>
            }
          >
            {overtime.pending.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">No overtime requests waiting.</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {overtime.pending.map((o) => (
                  <OvertimeRow key={o.id} o={o} today={today} currentUser={currentUser} />
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Recently decided">
            {overtime.decided.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">No decisions in the last 45 days.</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {overtime.decided.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{o.userName}</span>
                      <DayBadge dayKey={o.date} today={today} />
                      <Chip tone={o.status === "APPROVED" ? "accent" : "danger"}>
                        {o.status === "APPROVED" ? `Approved ${hm(o.approvedMinutes ?? o.requestedMinutes)}` : "Rejected"}
                      </Chip>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {o.reviewedByName ? `by ${o.reviewedByName}` : ""}
                      {o.reviewNote ? ` · “${o.reviewNote}”` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}

      {tab === "leave" && <LeaveBoard pending={leave.pending} recent={leave.recent} currentUser={currentUser} />}

      <ReviewDialog
        target={reviewTarget}
        open={!!reviewTarget}
        onOpenChange={(o) => !o && setReviewTarget(null)}
        currentUserId={currentUser.id}
        currentUserRole={currentUser.role}
      />
      <OvertimeDialog open={assignOpen} onOpenChange={setAssignOpen} leads={leads} employees={employees} assign />
    </div>
  );
}

function OvertimeRow({ o, today, currentUser }: { o: OvertimeView; today: string; currentUser: { id: string; role: string } }) {
  const router = useRouter();
  const [minutes, setMinutes] = useState(String(o.requestedMinutes));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const own = o.userId === currentUser.id && currentUser.role !== "ADMIN";
  const options = Array.from(new Set([o.requestedMinutes, 30, 60, 90, 120, 180, 240]))
    .sort((a, b) => a - b)
    .map((m) => ({ value: String(m), label: hm(m) }));

  async function decide(action: "APPROVE" | "REJECT") {
    setBusy(true);
    const res = await fetch(`/api/overtime/${o.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, approvedMinutes: Number(minutes), note: note.trim() || null }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Could not save");
      return;
    }
    toast.success(action === "APPROVE" ? "Overtime approved" : "Overtime rejected");
    router.refresh();
  }

  return (
    <li className="grid gap-3 px-5 py-4 lg:grid-cols-[1fr_auto] lg:items-center">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{o.userName}</span>
          <DayBadge dayKey={o.date} today={today} />
          <Chip tone="accent">Asks {hm(o.requestedMinutes)}</Chip>
          {o.publicHoliday && <Chip tone="info">Public holiday · 2×</Chip>}
          {o.submittedAfterShift && <Chip tone="warning">Submitted after the shift</Chip>}
          {o.exceedsDailyLimit && <Chip tone="danger">Over 10h/day</Chip>}
        </div>
        <p className="text-xs">{o.reason}</p>
        <p className=" text-[11px] text-muted-foreground">
          Schedule {o.scheduledLabel ?? "none"}
          {o.askedByName ? ` · asked by ${o.askedByName}` : " · own request"}
          {o.workedAfterShiftMinutes !== null ? ` · actually worked ${hm(o.workedAfterShiftMinutes)} after the shift` : ""}
        </p>
      </div>
      {own ? (
        <p className="text-[11px] text-muted-foreground">Your own request — another lead or an admin decides.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Select className="w-[110px]" value={minutes} onValueChange={setMinutes} options={options} />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" className={cn(inputClass, "h-10 w-[160px]")} aria-label="Decision note" />
          <Button variant="outline" disabled={busy} onClick={() => decide("REJECT")}>
            Reject
          </Button>
          <Button disabled={busy} onClick={() => decide("APPROVE")}>
            Approve
          </Button>
        </div>
      )}
    </li>
  );
}
