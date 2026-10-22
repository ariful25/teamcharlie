"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { UserX, UserCheck } from "lucide-react";

const ROLE_OPTIONS = [
  { value: "EMPLOYEE", label: "Employee" },
  { value: "TEAM_LEAD", label: "Team Lead" },
  { value: "ADMIN", label: "Admin" },
];

// showSlack: only the home team has the Slack app (lib/notifications.ts).
export function UsersManagementTable({
  users,
  currentUserId,
  showSlack = true,
}: {
  users: any[];
  currentUserId: string;
  showSlack?: boolean;
}) {
  const [rows, setRows] = useState(users);
  const [isPending, startTransition] = useTransition();
  const [discordDrafts, setDiscordDrafts] = useState<Record<string, string>>({});
  const [slackDrafts, setSlackDrafts] = useState<Record<string, string>>({});

  function updateRole(id: string, role: string) {
    startTransition(async () => {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        setRows((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
        toast.success("Role updated");
      } else {
        toast.error("Could not update role");
      }
    });
  }

  function saveChatId(id: string, field: "discordUserId" | "slackUserId", draft: string, label: string) {
    startTransition(async () => {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: draft || null }),
      });
      if (res.ok) {
        setRows((prev) => prev.map((u) => (u.id === id ? { ...u, [field]: draft || null } : u)));
        toast.success(`${label} ID saved`);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? `Could not save ${label} ID`);
      }
    });
  }

  function toggleActive(id: string, active: boolean) {
    if (id === currentUserId) {
      toast.error("You can't deactivate your own account");
      return;
    }
    if (active && !confirm("Deactivate this user? They will no longer be able to log in.")) return;

    startTransition(async () => {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !active }),
      });
      if (res.ok) {
        setRows((prev) => prev.map((u) => (u.id === id ? { ...u, active: !active } : u)));
        toast.success(active ? "User deactivated" : "User reactivated");
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Could not update user");
      }
    });
  }

  return (
    <div className="divide-y divide-border/60">
      {rows.map((u) => (
        <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
          <div className="min-w-[160px]">
            <p className="font-medium">{u.name}</p>
            <p className="text-xs text-muted-foreground">{u.email}</p>
          </div>
          <div className="flex items-center gap-2">
            {!u.active && <Badge tone="neutral">Deactivated</Badge>}
            <input
              value={discordDrafts[u.id] ?? u.discordUserId ?? ""}
              onChange={(e) => setDiscordDrafts((prev) => ({ ...prev, [u.id]: e.target.value }))}
              onBlur={() => {
                const draft = discordDrafts[u.id];
                if (draft !== undefined && draft.trim() !== (u.discordUserId ?? "")) {
                  saveChatId(u.id, "discordUserId", draft.trim(), "Discord");
                }
              }}
              placeholder="Discord user ID"
              title="Discord user ID — used to @mention them in task/digest notifications"
              className="w-[150px] rounded-lg border border-border bg-muted/40 px-2 py-1.5 text-xs outline-none focus:border-primary/50"
            />
            {showSlack && (
              <input
                value={slackDrafts[u.id] ?? u.slackUserId ?? ""}
                onChange={(e) => setSlackDrafts((prev) => ({ ...prev, [u.id]: e.target.value }))}
                onBlur={() => {
                  const draft = slackDrafts[u.id];
                  if (draft !== undefined && draft.trim() !== (u.slackUserId ?? "")) {
                    saveChatId(u.id, "slackUserId", draft.trim(), "Slack");
                  }
                }}
                placeholder="Slack user ID"
                title="Slack user ID — used to @mention them in task/digest notifications"
                className="w-[140px] rounded-lg border border-border bg-muted/40 px-2 py-1.5 text-xs outline-none focus:border-primary/50"
              />
            )}
            <Select
              className="w-[140px]"
              value={u.role}
              onValueChange={(role) => updateRole(u.id, role)}
              options={ROLE_OPTIONS}
              disabled={isPending}
            />
            <button
              disabled={isPending}
              onClick={() => toggleActive(u.id, u.active)}
              title={u.active ? "Deactivate" : "Reactivate"}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/60 disabled:opacity-50"
            >
              {u.active ? <UserX className="h-4 w-4 hover:text-danger" /> : <UserCheck className="h-4 w-4 hover:text-success" />}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
