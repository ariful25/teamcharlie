import { permissions } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { NotificationSettingsPanel } from "@/components/settings/notification-settings-panel";
import { ShiftTypesPanel } from "@/components/settings/shift-types-panel";
import { AddUserModal } from "@/components/settings/add-user-modal";
import { UsersManagementTable } from "@/components/settings/users-management-table";
import { CheckoutChecklistPanel } from "@/components/settings/checkout-checklist-panel";

export default async function SettingsPage() {
  const currentUser = await getCurrentUser();
  const canManageUsers = permissions.canManageUsers(currentUser.role);
  const canManageChecklists = permissions.canManageChecklists(currentUser.role);

  const [team, users, shiftTypes, checklistItems] = await Promise.all([
    prisma.team.findUnique({ where: { id: currentUser.teamId } }),
    prisma.user.findMany({ where: { teamId: currentUser.teamId }, orderBy: { name: "asc" } }),
    prisma.shiftType.findMany({ where: { teamId: currentUser.teamId, active: true }, orderBy: { startTime: "asc" } }),
    prisma.checklistItem.findMany({
      where: { teamId: currentUser.teamId, type: "CHECKOUT" },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const discordCheckinConfigured = !!process.env.DISCORD_CHECKIN_WEBHOOK_URL;
  const discordCheckoutConfigured = !!process.env.DISCORD_CHECKOUT_WEBHOOK_URL;
  const slackCheckinConfigured = !!(process.env.SLACK_BOT_TOKEN && (process.env.SLACK_CHECKIN_CHANNEL_ID || process.env.SLACK_TASK_CHANNEL_ID));
  const slackCheckoutConfigured = !!(process.env.SLACK_BOT_TOKEN && (process.env.SLACK_CHECKOUT_CHANNEL_ID || process.env.SLACK_TASK_CHANNEL_ID));

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
          <NotificationSettingsPanel
            testEndpoint="/api/settings/discord-test"
            checkinConfigured={discordCheckinConfigured}
            checkoutConfigured={discordCheckoutConfigured}
            helpText={
              <>
                Webhook URLs are configured via server environment variables (<code>DISCORD_CHECKIN_WEBHOOK_URL</code>,{" "}
                <code>DISCORD_CHECKOUT_WEBHOOK_URL</code>) and are never displayed here once set, for security.
              </>
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Slack Integration</CardTitle>
        </CardHeader>
        <CardContent>
          <NotificationSettingsPanel
            testEndpoint="/api/settings/slack-test"
            checkinConfigured={slackCheckinConfigured}
            checkoutConfigured={slackCheckoutConfigured}
            helpText={
              <>
                Configured via server environment variables (<code>SLACK_BOT_TOKEN</code>,{" "}
                <code>SLACK_CHECKIN_CHANNEL_ID</code>, <code>SLACK_CHECKOUT_CHANNEL_ID</code>) and never displayed
                here once set, for security.
              </>
            }
          />
        </CardContent>
      </Card>

      {canManageChecklists && (
        <Card>
          <CardHeader>
            <CardTitle>Checkout Checklist</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              Shown to every employee before they can confirm checkout. Add, edit, or remove items any time.
            </p>
            <CheckoutChecklistPanel items={checklistItems.map((c) => ({ id: c.id, label: c.label }))} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Shift Types</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            The shift blocks used across the Shift Schedule. Fully editable — add a new
            one any time your team&apos;s rotation changes.
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
