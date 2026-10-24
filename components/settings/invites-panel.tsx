"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Link2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { IconTooltip } from "@/components/ui/tooltip";
import { Field, inputClass } from "@/components/shared/form-field";
import { useTeamTimezone } from "@/components/providers/team-timezone";
import { formatClientDateTime } from "@/lib/time";

type Invite = { id: string; email: string; role: string; expiresAt: string };

const ROLE_OPTIONS = [
  { value: "EMPLOYEE", label: "Employee" },
  { value: "TEAM_LEAD", label: "Team Lead" },
  { value: "ADMIN", label: "Admin" },
];

// Invite-by-link. There's no outbound email service, so the admin copies the
// generated link and sends it themselves; it's shown once (only its hash is
// stored) and works once, for 7 days.
export function InvitesPanel({ invites }: { invites: Invite[] }) {
  const router = useRouter();
  const tz = useTeamTimezone();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("EMPLOYEE");
  const [busy, setBusy] = useState(false);
  const [lastLink, setLastLink] = useState<{ email: string; link: string } | null>(null);

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Invite link copied");
    } catch {
      toast.error("Couldn't copy — select the link and copy it manually");
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), role }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Could not create the invite");
      return;
    }
    setLastLink({ email: data.invite.email, link: data.link });
    setEmail("");
    copy(data.link);
    router.refresh();
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this invite? The link will stop working.")) return;
    const res = await fetch(`/api/invites/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Invite revoked");
      router.refresh();
    } else {
      toast.error("Could not revoke the invite");
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={create} className="grid gap-2 sm:grid-cols-[1fr_160px_auto] sm:items-end">
        <Field label="Invite by email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="teammate@company.com"
            className={inputClass}
          />
        </Field>
        <Field label="Role">
          <Select value={role} onValueChange={setRole} options={ROLE_OPTIONS} />
        </Field>
        <Button type="submit" disabled={busy} className="h-10">
          <Link2 className="h-4 w-4" /> Create invite link
        </Button>
      </form>

      {lastLink && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
          <p className="text-xs text-muted-foreground">
            Send this link to <span className="font-medium text-foreground">{lastLink.email}</span>. It&apos;s shown only once
            and expires in 7 days.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input readOnly value={lastLink.link} onFocus={(e) => e.target.select()} className={`${inputClass} font-mono text-xs`} aria-label="Invite link" />
            <IconTooltip label="Copy link">
              <button
                type="button"
                onClick={() => copy(lastLink.link)}
                aria-label="Copy invite link"
                className="rounded-lg border border-border p-2 text-muted-foreground transition hover:border-primary/40 hover:text-primary"
              >
                <Copy className="h-4 w-4" />
              </button>
            </IconTooltip>
          </div>
        </div>
      )}

      {invites.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Pending invites</p>
          <ul className="divide-y divide-border/60 rounded-xl border border-border">
            {invites.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {inv.role.replace("_", " ").toLowerCase()} · expires {formatClientDateTime(new Date(inv.expiresAt), tz)}
                  </p>
                </div>
                <IconTooltip label="Revoke invite">
                  <button
                    type="button"
                    onClick={() => revoke(inv.id)}
                    aria-label={`Revoke invite for ${inv.email}`}
                    className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-danger/10 hover:text-danger"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </IconTooltip>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
