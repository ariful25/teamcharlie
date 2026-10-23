import { permissions } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { NotificationSettingsPanel } from "@/components/settings/notification-settings-panel";
import { ShiftTypesPanel } from "@/components/settings/shift-types-panel";
import { AddUserModal } from "@/components/settings/add-user-modal";
import { UsersManagementTable } from "@/components/settings/users-management-table";
import { CheckoutChecklistPanel } from "@/components/settings/checkout-checklist-panel";
import { TeamProfileForm } from "@/components/settings/team-profile-form";
import { TeamWebhookPanel } from "@/components/settings/team-webhook-panel";
import { InvitesPanel } from "@/components/settings/invites-panel";
import { HOME_TEAM_SLUG } from "@/lib/brand";
import { AiSettingsPanel } from "@/components/settings/ai-settings-panel";
import { getTeamAiConfig } from "@/lib/ai/client";
import { DEFAULT_MODELS } from "@/lib/ai/providers";

export default async function SettingsPage() {
  const currentUser = await getCurrentUser();
  const canManageUsers = permissions.canManageUsers(currentUser.role);
  const canManageChecklists = permissions.canManageChecklists(currentUser.role);

  const canManageNotifications = permissions.canManageNotificationSettings(currentUser.role);

  const [team, users, shiftTypes, checklistItems, invites] = await Promise.all([
    prisma.team.findUniqueOrThrow({ where: { id: currentUser.teamId }, include: { settings: { select: { discordWebhookUrl: true, autoCheckoutHours: true, anthropicModel: true, openaiModel: true } } } }),
    prisma.user.findMany({ where: { teamId: currentUser.teamId }, orderBy: { name: "asc" } }),
    prisma.shiftType.findMany({ where: { teamId: currentUser.teamId, active: true }, orderBy: { startTime: "asc" } }),
    prisma.checklistItem.findMany({
      where: { teamId: currentUser.teamId, type: "CHECKOUT" },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
    canManageUsers
      ? prisma.teamInvite.findMany({
          where: { teamId: currentUser.teamId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
          select: { id: true, email: true, role: true, expiresAt: true },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  const [aiConfig, aiUsage] = canManageNotifications
    ? await Promise.all([
        getTeamAiConfig(currentUser.teamId),
        prisma.aiUsage.groupBy({
          by: ["feature", "ok"],
          where: { teamId: currentUser.teamId, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
          _count: { _all: true },
          _sum: { inputTokens: true, outputTokens: true },
        }),
      ])
    : [null, []];
  const usage = {
    calls: aiUsage.reduce((s, u) => s + u._count._all, 0),
    failed: aiUsage.filter((u) => !u.ok).reduce((s, u) => s + u._count._all, 0),
    inputTokens: aiUsage.reduce((s, u) => s + (u._sum.inputTokens ?? 0), 0),
    outputTokens: aiUsage.reduce((s, u) => s + (u._sum.outputTokens ?? 0), 0),
    byFeature: Object.values(
      aiUsage.reduce<Record<string, { feature: string; calls: number }>>((acc, u) => {
        acc[u.feature] = { feature: u.feature, calls: (acc[u.feature]?.calls ?? 0) + u._count._all };
        return acc;
      }, {})
    ),
  };

  // The env-configured Discord/Slack channels belong to the home team only
  // (lib/notifications.ts); every other team configures its own webhook.
  const isHomeTeam = team.slug === HOME_TEAM_SLUG;

  const discordCheckinConfigured = !!process.env.DISCORD_CHECKIN_WEBHOOK_URL;
  const discordCheckoutConfigured = !!process.env.DISCORD_CHECKOUT_WEBHOOK_URL;
  const slackCheckinConfigured = !!(process.env.SLACK_BOT_TOKEN && (process.env.SLACK_CHECKIN_CHANNEL_ID || process.env.SLACK_TASK_CHANNEL_ID));
  const slackCheckoutConfigured = !!(process.env.SLACK_BOT_TOKEN && (process.env.SLACK_CHECKOUT_CHANNEL_ID || process.env.SLACK_TASK_CHANNEL_ID));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Team configuration, members, and notifications.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Team Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <TeamProfileForm
            name={team.name}
            timezone={team.timezone}
            autoCheckoutHours={team.settings?.autoCheckoutHours ?? 10}
            canEdit={canManageNotifications}
          />
        </CardContent>
      </Card>

      {aiConfig && (
        <Card>
          <CardHeader>
            <CardTitle>AI</CardTitle>
          </CardHeader>
          <CardContent>
            <AiSettingsPanel
              enabled={aiConfig.enabled}
              provider={aiConfig.provider}
              anthropicModel={team.settings?.anthropicModel ?? ""}
              openaiModel={team.settings?.openaiModel ?? ""}
              defaultModels={DEFAULT_MODELS}
              hasAnthropicKey={aiConfig.hasAnthropicKey}
              hasOpenAiKey={aiConfig.hasOpenAiKey}
              dailyLimit={aiConfig.dailyLimit}
              usage={usage}
            />
          </CardContent>
        </Card>
      )}

      {!isHomeTeam && canManageNotifications && (
        <Card>
          <CardHeader>
            <CardTitle>Discord Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <TeamWebhookPanel configured={!!team.settings?.discordWebhookUrl} />
          </CardContent>
        </Card>
      )}

      {isHomeTeam && (
        <>
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

        </>
      )}

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

      {canManageUsers && (
        <Card>
          <CardHeader>
            <CardTitle>Invite Teammates</CardTitle>
          </CardHeader>
          <CardContent>
            <InvitesPanel invites={invites.map((i) => ({ ...i, expiresAt: i.expiresAt.toISOString() }))} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Users</CardTitle>
          {canManageUsers && <AddUserModal shiftTypes={shiftTypes.map((s) => ({ id: s.id, name: s.name }))} />}
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {canManageUsers ? (
            <UsersManagementTable users={users} currentUserId={currentUser.id} showSlack={isHomeTeam} />
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
