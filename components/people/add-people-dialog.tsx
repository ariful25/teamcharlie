"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, KeyRound, Link2, MessageCircle, UserPlus } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { IconTooltip } from "@/components/ui/tooltip";
import { Field, inputClass } from "@/components/shared/form-field";
import { cn } from "@/lib/utils";
import { companyWideRole, inviteMessage, parsePeopleList, rolesActorCanGive, type Role } from "@/lib/people/adding";
import type { AddResult } from "@/lib/people/add-service";

const ROLE_LABEL: Record<Role, string> = { EMPLOYEE: "Employee", TEAM_LEAD: "Team lead", HR: "HR", ADMIN: "Admin" };

type Props = {
  actor: { role: Role; squadId: string | null };
  squads: { id: string; name: string }[];
  shiftTypes: { id: string; name: string }[];
  companyName: string;
  /** The team picked in the switcher, so "Add people" starts in it. */
  defaultSquadId: string | null;
};

// One dialog for adding anyone: a single person or a pasted list, by invite
// link (they pick their own password) or a temporary password. Rules for
// who may add whom live in lib/people/adding.ts and are enforced again on
// the server.
export function AddPeopleDialog({ actor, squads, shiftTypes, companyName, defaultSquadId }: Props) {
  const router = useRouter();
  const roles = rolesActorCanGive(actor);
  const lockedSquad = actor.role === "TEAM_LEAD" ? actor.squadId : null;
  const startSquad = lockedSquad ?? defaultSquadId ?? (squads.length === 1 ? squads[0].id : "");

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"one" | "many">("one");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [list, setList] = useState("");
  const [role, setRole] = useState<Role>("EMPLOYEE");
  const [squadId, setSquadId] = useState(startSquad);
  const [shift, setShift] = useState("");
  const [method, setMethod] = useState<"invite" | "password">("invite");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<AddResult[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const parsed = useMemo(() => parsePeopleList(list), [list]);
  const people = mode === "one" ? (name.trim() && email.trim() ? [{ name: name.trim(), email: email.trim() }] : []) : parsed.people;
  const needsTeam = !companyWideRole(role);

  if (!roles.length) return null;

  function reset() {
    setResults(null);
    setName("");
    setEmail("");
    setList("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!people.length) return;
    setBusy(true);
    const res = await fetch("/api/people/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ people, role, squadId: needsTeam ? squadId || null : null, defaultShiftTypeId: shift || null, method }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.error ?? "Couldn't add them");
    setResults(data.results);
    router.refresh();
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Couldn't copy. Select the text and copy it manually.");
    }
  }

  const shareText = (r: AddResult) =>
    r.link
      ? inviteMessage(r.name, companyName, r.link)
      : `Hi ${r.name.split(/\s+/)[0]}, your TeamHQ login for ${companyName}: ${r.email} with the temporary password ${r.tempPassword} at ${window.location.origin}/login. Please change it after you sign in.`;

  const added = results?.filter((r) => r.ok) ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="h-4 w-4" /> Add people
        </Button>
      </DialogTrigger>
      <DialogContent title={results ? (added.length ? `${added.length} added` : "Nobody was added") : "Add people"} className="max-w-lg">
        {results ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {method === "invite"
                ? "Send each person their link. It works once and expires in 7 days. Only shown now."
                : "Give each person their temporary password. Only shown now."}
            </p>
            <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
              {results.map((r) => (
                <li key={r.email} className="rounded-xl border border-border bg-muted/20 p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{r.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{r.email}</p>
                    </div>
                    {r.ok ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <IconTooltip label={r.link ? "Copy invite link" : "Copy password"}>
                          <button
                            onClick={() => copy(r.link ?? r.tempPassword ?? "", r.email)}
                            aria-label={r.link ? `Copy invite link for ${r.name}` : `Copy password for ${r.name}`}
                            className="rounded-lg border border-border p-2 text-muted-foreground hover:border-primary/40 hover:text-primary"
                          >
                            {copied === r.email ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          </button>
                        </IconTooltip>
                        <IconTooltip label="Send on WhatsApp">
                          <a
                            href={`https://wa.me/?text=${encodeURIComponent(shareText(r))}`}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Send ${r.name}'s ${r.link ? "invite" : "login"} on WhatsApp`}
                            className="rounded-lg border border-border p-2 text-muted-foreground hover:border-primary/40 hover:text-primary"
                          >
                            <MessageCircle className="h-4 w-4" />
                          </a>
                        </IconTooltip>
                      </div>
                    ) : (
                      <span className="shrink-0 text-xs text-danger">{r.error}</span>
                    )}
                  </div>
                  {r.tempPassword && <code className="mt-2 block font-semibold tracking-wide text-primary">{r.tempPassword}</code>}
                </li>
              ))}
            </ul>
            {added.length > 1 && (
              <Button variant="outline" className="w-full" onClick={() => copy(added.map(shareText).join("\n\n"), "all")}>
                {copied === "all" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copy all messages
              </Button>
            )}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={reset}>
                Add more
              </Button>
              <Button className="flex-1" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            <div role="tablist" aria-label="How many" className="grid grid-cols-2 gap-1 rounded-xl bg-muted/40 p-1 text-sm">
              {(["one", "many"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => setMode(m)}
                  className={cn("rounded-lg py-1.5", mode === m ? "bg-background font-medium text-foreground" : "text-muted-foreground")}
                >
                  {m === "one" ? "One person" : "Several at once"}
                </button>
              ))}
            </div>

            {mode === "one" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name">
                  <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="off" className={inputClass} />
                </Field>
                <Field label="Email">
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" className={inputClass} />
                </Field>
              </div>
            ) : (
              <Field label="One person per line: name, email">
                <textarea
                  value={list}
                  onChange={(e) => setList(e.target.value)}
                  rows={5}
                  placeholder={"Rafi Ahmed, rafi@company.com\nNadia Islam, nadia@company.com"}
                  className={`${inputClass} font-mono text-xs`}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {parsed.people.length} ready
                  {parsed.problems.length > 0 && <span className="text-warning"> · {parsed.problems.length} skipped: {parsed.problems.map((p) => `"${p.line}" (${p.reason.toLowerCase()})`).join(", ")}</span>}
                </p>
              </Field>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Role">
                <Select value={role} onValueChange={(v) => setRole(v as Role)} options={roles.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} disabled={roles.length === 1} />
              </Field>
              {needsTeam ? (
                <Field label="Team">
                  <Select
                    value={squadId}
                    onValueChange={setSquadId}
                    placeholder="Pick a team"
                    disabled={!!lockedSquad}
                    options={squads.map((s) => ({ value: s.id, label: `Team ${s.name}` }))}
                  />
                </Field>
              ) : (
                <p className="self-end pb-2 text-xs text-muted-foreground">{ROLE_LABEL[role]} works across all teams.</p>
              )}
            </div>
            {shiftTypes.length > 0 && (
              <Field label="Usual shift (optional)">
                <Select value={shift} onValueChange={setShift} placeholder="None" options={[{ value: "", label: "None" }, ...shiftTypes.map((s) => ({ value: s.id, label: s.name }))]} />
              </Field>
            )}

            <fieldset className="grid gap-3 sm:grid-cols-2">
              <legend className="mb-2 text-xs text-muted-foreground">How they get in</legend>
              {(
                [
                  ["invite", Link2, "Invite link", "They choose their own password. Recommended."],
                  ["password", KeyRound, "Temporary password", "You give it to them; they change it later."],
                ] as const
              ).map(([value, Icon, title, hint]) => (
                <label
                  key={value}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-xl border p-3 text-sm transition-colors",
                    method === value ? "border-primary/50 bg-primary/10 glow-border" : "border-border bg-muted/20 hover:border-primary/30"
                  )}
                >
                  <input type="radio" name="method" value={value} checked={method === value} onChange={() => setMethod(value)} className="sr-only" />
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", method === value ? "text-primary" : "text-muted-foreground")} />
                  <span>
                    <span className="block font-medium">{title}</span>
                    <span className="text-xs text-muted-foreground">{hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <Button type="submit" disabled={busy || !people.length || (needsTeam && !squadId)} className="w-full">
              {busy ? "Adding..." : people.length > 1 ? `Add ${people.length} people` : "Add person"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
