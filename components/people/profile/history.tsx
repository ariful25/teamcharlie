"use client";

import { useState } from "react";
import { AlertTriangle, Award, Briefcase, CalendarClock, NotebookPen, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { IconTooltip } from "@/components/ui/tooltip";
import { Field, inputClass } from "@/components/shared/form-field";
import { useTeamTimezone } from "@/components/providers/team-timezone";
import { formatClientDateTime } from "@/lib/time";
import type { ProfileData } from "@/lib/people/queries";
import { useMutate, Section, DialogActions } from "./shared";

export const EVENT_META = {
  JOINED: { icon: CalendarClock, tone: "text-primary bg-primary/10", label: "Joined" },
  JOB_CHANGE: { icon: Briefcase, tone: "text-info bg-info/10", label: "Job change" },
  PRAISE: { icon: Award, tone: "text-success bg-success/10", label: "Praise" },
  NOTE: { icon: NotebookPen, tone: "text-muted-foreground bg-muted/40", label: "Note" },
  WARNING: { icon: AlertTriangle, tone: "text-warning bg-warning/10", label: "Warning" },
} as const;

export function HistoryTab({ data }: { data: ProfileData }) {
  const tz = useTeamTimezone();
  const { events, access, person } = data;
  const [adding, setAdding] = useState<"PRAISE" | "NOTE" | "WARNING" | null>(null);
  const { busy, run } = useMutate();
  return (
    <Section
      title="History"
      action={
        <div className="flex gap-1">
          {access.addPraise && (
            <Button size="sm" variant="ghost" onClick={() => setAdding("PRAISE")}>
              <Award className="h-3.5 w-3.5" /> Praise
            </Button>
          )}
          {access.addNoteOrWarning && (
            <>
              <Button size="sm" variant="ghost" onClick={() => setAdding("NOTE")}>
                <NotebookPen className="h-3.5 w-3.5" /> Note
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding("WARNING")}>
                <AlertTriangle className="h-3.5 w-3.5" /> Warning
              </Button>
            </>
          )}
        </div>
      }
    >
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">Job changes, praise and notes appear here as they happen.</p>
      ) : (
        <ol className="relative space-y-5 before:absolute before:bottom-2 before:left-[17px] before:top-2 before:w-px before:bg-border">
          {events.map((e) => {
            const meta = EVENT_META[e.kind as keyof typeof EVENT_META];
            const Icon = meta.icon;
            return (
              <li key={e.id} className="relative flex gap-3">
                <span className={cn("relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-4 ring-[hsl(var(--card))]", meta.tone)}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1 pt-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="text-sm font-medium">
                      {e.title}
                      {e.private && <span className="ml-2 text-xs font-normal text-muted-foreground">admins only</span>}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {e.by} · {formatClientDateTime(new Date(e.at), tz)}
                    </span>
                  </div>
                  {e.detail && <p className="mt-1 max-w-[68ch] whitespace-pre-line text-sm text-foreground/85">{e.detail}</p>}
                  {e.changes && (
                    <ul className="mt-2 space-y-1 text-xs">
                      {e.changes.map((c, i) => (
                        <li key={i} className="text-muted-foreground">
                          {c.field}: <span className="line-through opacity-70">{c.from ?? "·"}</span> <span className="text-foreground">{c.to ?? "·"}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {access.viewPrivateEvents && e.kind !== "JOB_CHANGE" && e.kind !== "JOINED" && (
                  <IconTooltip label="Remove entry">
                    <button
                      aria-label="Remove entry"
                      disabled={busy}
                      onClick={() => confirm("Remove this entry?") && run(`/api/people/${person.id}/items?type=event&id=${e.id}`, "DELETE", undefined, "Entry removed")}
                      className="h-fit rounded-lg p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </IconTooltip>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {adding && <EventDialog userId={person.id} kind={adding} name={person.name} onClose={() => setAdding(null)} />}
    </Section>
  );
}

export function EventDialog({ userId, kind, name, onClose }: { userId: string; kind: "PRAISE" | "NOTE" | "WARNING"; name: string; onClose: () => void }) {
  const { busy, run } = useMutate();
  const [f, setF] = useState({ title: "", detail: "" });
  const first = name.split(" ")[0];
  const copy = {
    PRAISE: { title: `Praise ${first}`, hint: `${first} can see this.`, ph: "Handled a midnight lockout perfectly" },
    NOTE: { title: `Note about ${first}`, hint: "Only admins can see notes.", ph: "Discussed shift swap for Eid" },
    WARNING: { title: `Warning for ${first}`, hint: "Only admins can see warnings.", ph: "Third missed check-out this month" },
  }[kind];
  async function save() {
    if (await run(`/api/people/${userId}/items`, "POST", { type: "event", kind, ...f }, "Saved to history")) onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={copy.title} className="max-w-md">
        <div className="space-y-3">
          <Field label="Title">
            <input className={inputClass} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={copy.ph} />
          </Field>
          <Field label="Details (optional)">
            <textarea className={cn(inputClass, "min-h-[88px]")} maxLength={1000} value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} />
          </Field>
          <p className="text-xs text-muted-foreground">{copy.hint}</p>
          <DialogActions busy={busy} onCancel={onClose} onSave={save} label="Save" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
