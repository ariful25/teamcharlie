"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";
import { IconTooltip } from "@/components/ui/tooltip";
import { useTeamTimezone } from "@/components/providers/team-timezone";
import { formatClientDateTime } from "@/lib/time";

type Invite = { id: string; email: string; name: string | null; role: string; team: string | null; expiresAt: string };

const ROLE_LABEL: Record<string, string> = { EMPLOYEE: "Employee", TEAM_LEAD: "Team lead", HR: "HR", ADMIN: "Admin" };

// Pending invite links. They're created from Members → Add people; each is
// shown once there (only its hash is stored) and works once, for 7 days.
// Revoking here stops a link that went to the wrong person.
export function InvitesPanel({ invites }: { invites: Invite[] }) {
  const router = useRouter();
  const tz = useTeamTimezone();

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

  if (!invites.length) return <p className="text-sm text-muted-foreground">No pending invites. Add people from Members.</p>;

  return (
    <div className="space-y-3">
      {invites.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Pending invites</p>
          <ul className="divide-y divide-border/60 rounded-xl border border-border">
            {invites.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{inv.name ?? inv.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {inv.name ? `${inv.email} · ` : ""}
                    {ROLE_LABEL[inv.role] ?? inv.role}
                    {inv.team ? `, Team ${inv.team}` : ""} · expires {formatClientDateTime(new Date(inv.expiresAt), tz)}
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
