import { permissions } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DiscordSettingsPanel } from "@/components/settings/discord-settings-panel";
import { ShiftTypesPanel } from "@/components/settings/shift-types-panel";
import { AddUserModal } from "@/components/settings/add-user-modal";
import { UsersManagementTable } from "@/components/settings/users-management-table";

export default async function SettingsPage() {
  const currentUser = await getCurrentUser();
  const canManageUsers = permissions.canManageUsers(currentUser.role);

  const [team, users, shiftTypes] = await Promise.all([
    prisma.team.findUnique({ where: { id: currentUser.teamId } }),
    prisma.user.findMany({ where: { teamId: currentUser.teamId }, orderBy: { name: "asc" } }),
    prisma.shiftType.findMany({ where: { teamId: currentUser.teamId, active: true }, orderBy: { startTime: "asc" } }),
  ]);

  const checkinConfigured = !!process.env.DISCORD_CHECKIN_WEBHOOK_URL;
  const checkoutConfigured = !!process.env.DISCORD_CHECKOUT_WEBHOOK_URL;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Team configuration for Team Charlie.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Team Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Team</span>
            <span className="font-medium">{team?.name}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Timezone</span>
            <span className="font-medium">{team?.timezone}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Discord Integration</CardTitle>
        </CardHeader>
        <CardContent>
          <DiscordSettingsPanel checkinConfigured={checkinConfigured} checkoutConfigured={checkoutConfigured} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shift Types</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            The shift blocks used across the Shift Schedule. Fully editable — add a new
            one any time your team's rotation changes.
          </p>
          <ShiftTypesPanel shiftTypes={shiftTypes} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Users</CardTitle>
          {canManageUsers && <AddUserModal shiftTypes={shiftTypes.map((s) => ({ id: s.id, name: s.name }))} />}
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {canManageUsers ? (
            <UsersManagementTable users={users} currentUserId={currentUser.id} />
          ) : (
            <div className="space-y-2 px-5 pb-4">
              {users
                .filter((u) => u.active)
                .map((u) => (
                  <div key={u.id} className="flex items-center justify-between border-t border-border/60 py-3 text-sm first:border-0">
                    <div>
                      <p className="font-medium">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    <span className="text-xs capitalize text-muted-foreground">{u.role.replace("_", " ").toLowerCase()}</span>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
