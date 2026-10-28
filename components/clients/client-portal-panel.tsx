"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, MessageCircle, UserCheck, UserX, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
import { Field, inputClass } from "@/components/shared/form-field";
import { useTeamTimezone } from "@/components/providers/team-timezone";
import { formatClientDateTime } from "@/lib/time";
import { portalInviteMessage } from "@/lib/portal/rules";

type Access = {
  users: { id: string; name: string; email: string; active: boolean; lastLoginAt: string | null }[];
  invites: { id: string; name: string | null; email: string; expiresAt: string }[];
};

// Owner logins for this client's portal (/portal): invite, see who has
// access, turn a login off. The portal shows the owner their listings,
// reviews, listing health and property details, and lets them send requests
// that land on this client's team's task board.
export function ClientPortalPanel({ clientId, clientName, access, canManage }: { clientId: string; clientName: string; access: Access; canManage: boolean }) {
  const router = useRouter();
  const tz = useTeamTimezone();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ name: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Couldn't save");
      return null;
    }
    router.refresh();
    return data;
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const data = await call(`/api/clients/${clientId}/portal`, "POST", { name, email });
    if (!data) return;
    setLast({ name, link: data.link });
    setName("");
    setEmail("");
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy. Select the link and copy it manually.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Owner portal</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          The owner sees their listings, reviews, listing health and property details, and sends requests to your team. They never see codes, internal notes, staff or other clients.
        </p>

        {access.users.length > 0 && (
          <ul className="divide-y divide-border/60 rounded-xl border border-border">
            {access.users.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {u.name} {!u.active && <span className="text-xs font-normal text-muted-foreground">(turned off)</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {u.email} · {u.lastLoginAt ? `last in ${formatClientDateTime(new Date(u.lastLoginAt), tz)}` : "hasn't signed in yet"}
                  </p>
                </div>
                {canManage && (
                  <IconTooltip label={u.active ? "Turn off this login" : "Turn this login back on"}>
                    <button
                      disabled={busy}
                      onClick={() => {
                        if (u.active && !confirm(`Turn off ${u.name}'s portal login? They'll be signed out on their next click.`)) return;
                        call(`/api/clients/${clientId}/portal/${u.id}`, "PATCH", { active: !u.active }).then((d) => d && toast.success(u.active ? "Login turned off" : "Login turned on"));
                      }}
                      aria-label={u.active ? `Turn off ${u.name}'s login` : `Turn on ${u.name}'s login`}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/50"
                    >
                      {u.active ? <UserX className="h-4 w-4 hover:text-danger" /> : <UserCheck className="h-4 w-4 hover:text-success" />}
                    </button>
                  </IconTooltip>
                )}
              </li>
            ))}
          </ul>
        )}

        {access.invites.length > 0 && (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {access.invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2">
                <span className="truncate">
                  Invited {i.name ?? i.email} · link expires {formatClientDateTime(new Date(i.expiresAt), tz)}
                </span>
                {canManage && (
                  <IconTooltip label="Revoke link">
                    <button
                      onClick={() => call(`/api/clients/${clientId}/portal/invites/${i.id}`, "DELETE").then((d) => d && toast.success("Link revoked"))}
                      aria-label={`Revoke the link for ${i.email}`}
                      className="rounded-lg p-1 hover:bg-danger/10 hover:text-danger"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </IconTooltip>
                )}
              </li>
            ))}
          </ul>
        )}

        {canManage && (
          <form onSubmit={invite} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="Owner's name">
              <input value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
            </Field>
            <Field label="Their email">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputClass} />
            </Field>
            <Button type="submit" disabled={busy} className="h-10">
              Invite owner
            </Button>
          </form>
        )}

        {last && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
            <span className="flex-1 text-xs text-muted-foreground">Send {last.name} their link. It&apos;s shown only now and works once, for 7 days.</span>
            <Button variant="outline" onClick={() => copy(last.link)}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copy link
            </Button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(portalInviteMessage(last.name, clientName, last.link))}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 hover:bg-muted/40"
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
          </div>
        )}

        <a href="/portal/login" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
          Owner sign-in page <ExternalLink className="h-3 w-3" />
        </a>
      </CardContent>
    </Card>
  );
}
