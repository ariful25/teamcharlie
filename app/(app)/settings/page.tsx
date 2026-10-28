import { permissions } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Suspense } from "react";
import { SettingsShell, type SettingsSection } from "@/components/settings/settings-shell";
import { PushToggle } from "@/components/pwa/push";
import { NotificationSettingsPanel } from "@/components/settings/notification-settings-panel";
import { ShiftTypesPanel } from "@/components/settings/shift-types-panel";
import { AddPeopleDialog } from "@/components/people/add-people-dialog";
import { TeamsPanel, type TeamRow } from "@/components/teams/teams-panel";
import { getScope, inSquad } from "@/lib/scope";
import { UsersManagementTable } from "@/components/settings/users-management-table";
import { CheckoutChecklistPanel } from "@/components/settings/checkout-checklist-panel";
import { TeamProfileForm } from "@/components/settings/team-profile-form";
import { TeamWebhookPanel } from "@/components/settings/team-webhook-panel";
import { InvitesPanel } from "@/components/settings/invites-panel";
import { HOME_TEAM_SLUG, PRODUCT_NAME } from "@/lib/brand";
import { AiSettingsPanel } from "@/components/settings/ai-settings-panel";
import { getTeamAiConfig } from "@/lib/ai/client";
import { DEFAULT_MODELS } from "@/lib/ai/providers";
import { inboxStatus } from "@/lib/listing-health/inbox";
import { ReviewSyncPanel } from "@/components/settings/review-sync-panel";

export default async function SettingsPage() {
  const currentUser = await getCurrentUser();
  const canManageUsers = permissions.canManageUsers(currentUser.role);
  const canAddPeople = permissions.canAddPeople(currentUser.role);
  const scope = await getScope(currentUser);
  const canManageChecklists = permissions.canManageChecklists(currentUser.role);

  const canManageNotifications = permissions.canManageNotificationSettings(currentUser.role);

  const [team, users, shiftTypes, checklistItems, invites, squads] = await Promise.all([
    prisma.team.findUniqueOrThrow({ where: { id: currentUser.teamId }, include: { settings: { select: { discordWebhookUrl: true, autoCheckoutHours: true, anthropicModel: true, openaiModel: true } } } }),
    // Members of the team being looked at (Admin and HR: the switcher's pick, or everyone).
    prisma.user.findMany({ where: inSquad(scope), orderBy: { name: "asc" } }),
    prisma.shiftType.findMany({ where: { teamId: currentUser.teamId, active: true }, orderBy: { startTime: "asc" } }),
    prisma.checklistItem.findMany({
      where: { teamId: currentUser.teamId, type: "CHECKOUT" },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
    canManageUsers
      ? prisma.teamInvite.findMany({
          where: { teamId: currentUser.teamId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
          select: { id: true, email: true, name: true, role: true, expiresAt: true, squad: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    prisma.squad.findMany({
      where: { teamId: currentUser.teamId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        active: true,
        users: { where: { active: true }, select: { name: true, role: true } },
        _count: { select: { clients: { where: { active: true } } } },
      },
    }),
  ]);
  const activeSquads = squads.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name }));
  const teamRows: TeamRow[] = squads.map((s) => ({
    id: s.id,
    name: s.name,
    active: s.active,
    leads: s.users.filter((u) => u.role === "TEAM_LEAD").map((u) => u.name),
    people: s.users.length,
    clients: s._count.clients,
  }));
  const addPeople = canAddPeople ? (
    <AddPeopleDialog
      actor={{ role: currentUser.role, squadId: currentUser.squadId }}
      squads={activeSquads}
      shiftTypes={shiftTypes.map((s) => ({ id: s.id, name: s.name }))}
      companyName={team.name}
      defaultSquadId={scope.squadId}
    />
  ) : undefined;

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

  const activeUsers = users.filter((u) => u.active);
  const reviewSync = canManageNotifications ? await inboxStatus(currentUser.teamId) : null;
  const aiReady = !!aiConfig?.enabled && (aiConfig.provider === "OPENAI" ? aiConfig.hasOpenAiKey : aiConfig.hasAnthropicKey);
  const integrationStatus = (a: boolean, b: boolean): SettingsSection["status"] =>
    a && b ? { text: "Connected", tone: "ok" } : a || b ? { text: "Partial", tone: "warn" } : { text: "Not set up", tone: "off" };

  const sections: SettingsSection[] = [
    {
      id: "team",
      group: "Workspace",
      label: "Company",
      description: "Your company's name, the timezone for shifts and reports, plus when a forgotten check-out stops the timer.",
      status: { text: team.timezone.split("/").pop()!.replace("_", " "), tone: "info" },
      content: (
        <TeamProfileForm
          name={team.name}
          timezone={team.timezone}
          autoCheckoutHours={team.settings?.autoCheckoutHours ?? 10}
          canEdit={canManageNotifications}
        />
      ),
    },
    {
      id: "device",
      group: "Workspace",
      label: "This device",
      description: "Notifications on this phone or computer: new tasks for you, leave decisions and team notices. Each device is turned on separately.",
      status: { text: "Per device", tone: "info" },
      content: <PushToggle explainSetup />,
    },
    {
      id: "shifts",
      group: "Workspace",
      label: "Shift types",
      description: "The shift blocks used across the Shift Schedule. Add or change one whenever your rotation changes.",
      status: { text: String(shiftTypes.length), tone: "info" },
      content: <ShiftTypesPanel shiftTypes={shiftTypes} />,
    },
    ...(canManageChecklists
      ? [
          {
            id: "checklist",
            group: "Workspace" as const,
            label: "Checkout checklist",
            description: "Every employee ticks these before they can check out.",
            status: { text: String(checklistItems.length), tone: checklistItems.length ? ("info" as const) : ("off" as const) },
            content: <CheckoutChecklistPanel items={checklistItems.map((c) => ({ id: c.id, label: c.label }))} />,
          },
        ]
      : []),
    ...(canManageUsers
      ? [
          {
            id: "teams",
            group: "People" as const,
            label: "Teams",
            description: "The teams inside your company. Each has its own people, clients, roster, tasks and notices. Admin and HR see them all.",
            status: { text: String(activeSquads.length), tone: "info" as const },
            content: <TeamsPanel teams={teamRows} canManage={permissions.canManageSquads(currentUser.role)} />,
          },
        ]
      : []),
    {
      id: "members",
      group: "People",
      label: "Members",
      description: canManageUsers
        ? "Everyone in the team you're looking at: their team, role and who can sign in. Use the team switcher to see another team."
        : "Everyone on your team.",
      status: { text: `${activeUsers.length} active`, tone: "info" },
      action: addPeople,
      content: canManageUsers ? (
        <div className="-mx-5 -mb-5 -mt-2">
          <UsersManagementTable
            users={users}
            currentUserId={currentUser.id}
            showSlack={isHomeTeam}
            squads={activeSquads}
            actor={{ role: currentUser.role, squadId: currentUser.squadId }}
          />
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {activeUsers.map((u) => (
            <li key={u.id} className="flex items-center justify-between py-3 text-sm">
              <div>
                <p className="font-medium">{u.name}</p>
                <p className="text-xs text-muted-foreground">{u.email}</p>
              </div>
              <span className="text-xs capitalize text-muted-foreground">{u.role.replace("_", " ").toLowerCase()}</span>
            </li>
          ))}
        </ul>
      ),
    },
    ...(canManageUsers
      ? [
          {
            id: "invites",
            group: "People" as const,
            label: "Invites",
            description: "Invite links that haven't been used yet. Add people from Members; revoke a link here if it went to the wrong person.",
            status: invites.length ? { text: `${invites.length} pending`, tone: "warn" as const } : undefined,
            content: <InvitesPanel invites={invites.map((i) => ({ id: i.id, email: i.email, name: i.name, role: i.role, team: i.squad?.name ?? null, expiresAt: i.expiresAt.toISOString() }))} />,
          },
        ]
      : []),
    ...(aiConfig
      ? [
          {
            id: "ai",
            group: "Integrations" as const,
            label: "AI",
            description: "Connect your own Anthropic or OpenAI key for listing insights, guest replies and check-in guides.",
            status: aiReady ? { text: "Connected", tone: "ok" as const } : { text: "Off", tone: "off" as const },
            content: (
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
            ),
          },
        ]
      : []),
    ...(reviewSync
      ? [
          {
            id: "reviews",
            group: "Integrations" as const,
            label: "Airbnb email sync",
            description: "Brings Airbnb bookings, changes, cancellations and reviews in from your Gmail for the Reviews pipeline. No Airbnb API needed. Guest messages are never read.",
            status: reviewSync.connected ? { text: "On", tone: "ok" as const } : { text: "Off", tone: "off" as const },
            content: <ReviewSyncPanel initial={reviewSync} />,
          },
        ]
      : []),
    ...(!isHomeTeam && canManageNotifications
      ? [
          {
            id: "discord",
            group: "Integrations" as const,
            label: "Discord",
            description: "Post check-ins, check-outs and alerts to a Discord channel.",
            status: team.settings?.discordWebhookUrl ? { text: "Connected", tone: "ok" as const } : { text: "Not set up", tone: "off" as const },
            content: <TeamWebhookPanel configured={!!team.settings?.discordWebhookUrl} />,
          },
        ]
      : []),
    ...(isHomeTeam
      ? [
          {
            id: "discord",
            group: "Integrations" as const,
            label: "Discord",
            description: "Check-in and check-out posts to your Discord channels.",
            status: integrationStatus(discordCheckinConfigured, discordCheckoutConfigured),
            content: (
              <NotificationSettingsPanel
                testEndpoint="/api/settings/discord-test"
                checkinConfigured={discordCheckinConfigured}
                checkoutConfigured={discordCheckoutConfigured}
                helpText={
                  <>
                    Webhook URLs are set as server environment variables (<code>DISCORD_CHECKIN_WEBHOOK_URL</code>,{" "}
                    <code>DISCORD_CHECKOUT_WEBHOOK_URL</code>) and never shown here once set.
                  </>
                }
              />
            ),
          },
          {
            id: "slack",
            group: "Integrations" as const,
            label: "Slack",
            description: "Check-in and check-out posts to your Slack channels.",
            status: integrationStatus(slackCheckinConfigured, slackCheckoutConfigured),
            content: (
              <NotificationSettingsPanel
                testEndpoint="/api/settings/slack-test"
                checkinConfigured={slackCheckinConfigured}
                checkoutConfigured={slackCheckoutConfigured}
                helpText={
                  <>
                    Set as server environment variables (<code>SLACK_BOT_TOKEN</code>, <code>SLACK_CHECKIN_CHANNEL_ID</code>,{" "}
                    <code>SLACK_CHECKOUT_CHANNEL_ID</code>) and never shown here once set.
                  </>
                }
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">How your team works in {PRODUCT_NAME}: schedule rules, people and connected tools.</p>
      </div>
      <Suspense>
        <SettingsShell teamName={team.name} sections={sections} />
      </Suspense>
    </div>
  );
}
