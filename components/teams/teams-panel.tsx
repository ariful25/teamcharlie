"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
import { inputClass } from "@/components/shared/form-field";

export type TeamRow = { id: string; name: string; active: boolean; leads: string[]; people: number; clients: number };

// The teams inside the company. Admin creates, renames and closes them; HR
// sees the same list read-only. Moving people and clients between teams
// happens on the person (Members) and on the client.
export function TeamsPanel({ teams, canManage }: { teams: TeamRow[]; canManage: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  async function send(url: string, method: string, body: unknown, done: string) {
    setBusy(true);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Couldn't save");
      return false;
    }
    toast.success(done);
    router.refresh();
    return true;
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (await send("/api/squads", "POST", { name }, `Team ${name.replace(/^team\s+/i, "")} created`)) setName("");
  }

  const active = teams.filter((t) => t.active);
  const closed = teams.filter((t) => !t.active);

  return (
    <div className="space-y-5">
      <ul className="grid gap-3 sm:grid-cols-2">
        {active.map((t) => (
          <li key={t.id} className="rounded-xl border border-border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-2">
              {editing === t.id ? (
                <form
                  className="flex flex-1 items-center gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (await send(`/api/squads/${t.id}`, "PATCH", { name: draft }, "Team renamed")) setEditing(null);
                  }}
                >
                  <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Team name" className={`${inputClass} h-8`} />
                  <IconTooltip label="Save name">
                    <button type="submit" disabled={busy} aria-label="Save name" className="rounded-lg p-1.5 text-primary hover:bg-primary/10">
                      <Check className="h-4 w-4" />
                    </button>
                  </IconTooltip>
                  <IconTooltip label="Cancel">
                    <button type="button" onClick={() => setEditing(null)} aria-label="Cancel" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/50">
                      <X className="h-4 w-4" />
                    </button>
                  </IconTooltip>
                </form>
              ) : (
                <>
                  <p className="font-display text-base font-semibold">Team {t.name}</p>
                  {canManage && (
                    <IconTooltip label="Rename team">
                      <button
                        onClick={() => {
                          setEditing(t.id);
                          setDraft(t.name);
                        }}
                        aria-label={`Rename team ${t.name}`}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </IconTooltip>
                  )}
                </>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Lead: {t.leads.length ? t.leads.join(", ") : "none yet"}
            </p>
            <p className="text-xs text-muted-foreground">
              {t.people} {t.people === 1 ? "person" : "people"} · {t.clients} {t.clients === 1 ? "client" : "clients"}
            </p>
            {canManage && t.people === 0 && t.clients === 0 && (
              <button
                onClick={() => send(`/api/squads/${t.id}`, "PATCH", { active: false }, `Team ${t.name} closed`)}
                disabled={busy}
                className="mt-2 text-xs text-muted-foreground underline-offset-2 hover:text-danger hover:underline"
              >
                Close this team
              </button>
            )}
          </li>
        ))}
      </ul>

      {canManage && (
        <form onSubmit={create} className="flex items-end gap-3">
          <label className="flex-1 text-xs text-muted-foreground">
            New team
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Delta" required className={`${inputClass} mt-1`} />
          </label>
          <Button type="submit" disabled={busy || !name.trim()} className="h-10">
            <Plus className="h-4 w-4" /> Add team
          </Button>
        </form>
      )}

      {canManage && closed.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Closed:{" "}
          {closed.map((t, i) => (
            <span key={t.id}>
              {i > 0 && ", "}
              <button onClick={() => send(`/api/squads/${t.id}`, "PATCH", { active: true }, `Team ${t.name} reopened`)} className="underline-offset-2 hover:text-foreground hover:underline">
                {t.name} (reopen)
              </button>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
