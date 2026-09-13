import { notFound } from "next/navigation";
import Link from "next/link";
import { getClientWorkspaceData } from "@/lib/queries/clients";
import { getCurrentUser } from "@/lib/session";
import { permissions } from "@/lib/auth";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge, statusTone, priorityTone } from "@/components/ui/badge";
import { PerfectStayWorkspace } from "@/components/properties/perfect-stay-workspace";

export default async function ClientWorkspacePage({ params }: { params: { id: string } }) {
  const currentUser = await getCurrentUser();
  const { client, tasks, recurringTasks, issues, properties, leads } = await getClientWorkspaceData(params.id);
  if (!client) notFound();

  const canManageProperties = permissions.canManageProperties(currentUser.role);
  const isJackPlaceholder = client.name === "Jack";
  const isPerfectStay = client.name === "Perfect Stay";
  const plainProperties = JSON.parse(JSON.stringify(properties));
  const plainLeads = JSON.parse(JSON.stringify(leads));
  const plainIssues = JSON.parse(JSON.stringify(issues));
  const plainRecurringTasks = JSON.parse(JSON.stringify(recurringTasks));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{client.name}</h1>
          <div className="mt-2 flex items-center gap-2">
            <Badge tone={statusTone(client.status)}>{client.status.replace("_", " ")}</Badge>
            {client.guestCommunicationPlatform && (
              <span className="text-xs text-muted-foreground">
                Guest Comms: {client.guestCommunicationPlatform}
              </span>
            )}
            {client.operationPlatform && (
              <span className="text-xs text-muted-foreground">· Ops: {client.operationPlatform}</span>
            )}
          </div>
        </div>
        <Link
          href={`/knowledge-base?clientId=${client.id}`}
          className="rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          Prepare Knowledge Base
        </Link>
      </div>

      {isJackPlaceholder ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {client.notes ?? "Workflow pending configuration."}
          </p>
          <p className="mt-2 text-xs text-muted-foreground/70">
            This is a placeholder workspace. Full operational workflow for {client.name} will be configured
            in a future module.
          </p>
        </Card>
      ) : isPerfectStay ? (
        <PerfectStayWorkspace
          client={client}
          properties={plainProperties}
          leads={plainLeads}
          issues={plainIssues}
          recurringTasks={plainRecurringTasks}
          canManage={canManageProperties}
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Today&apos;s Tasks</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-0 pb-2">
              {tasks.length === 0 ? (
                <p className="px-5 pb-4 text-sm text-muted-foreground">No tasks scheduled today.</p>
              ) : (
                tasks.map((t) => (
                  <div key={t.id} className="flex items-center justify-between border-t border-border/60 px-5 py-3 text-sm first:border-0">
                    <div>
                      <p className="font-medium">{t.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.startTime ?? "—"} · {t.assignedUser?.name ?? "Unassigned"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={priorityTone(t.priority)}>{t.priority}</Badge>
                      <Badge tone={statusTone(t.status)}>{t.status.replace("_", " ")}</Badge>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recurring Tasks</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-0 pb-2">
              {recurringTasks.length === 0 ? (
                <p className="px-5 pb-4 text-sm text-muted-foreground">No recurring tasks configured for this client.</p>
              ) : (
                recurringTasks.map((r) => (
                  <div key={r.id} className="flex items-center justify-between border-t border-border/60 px-5 py-3 text-sm first:border-0">
                    <div>
                      <p className="font-medium">{r.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.startTime}–{r.dueTime} · {r.assignedUser?.name ?? "Unassigned"} ·{" "}
                        {r.repeatMode === "DAILY" ? "Every day" : r.repeatMode}
                      </p>
                    </div>
                    <Badge tone={priorityTone(r.priority)}>{r.priority}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Issues</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-0 pb-2">
              {issues.length === 0 ? (
                <p className="px-5 pb-4 text-sm text-muted-foreground">No open issues 🎉</p>
              ) : (
                issues.map((i) => (
                  <div key={i.id} className="flex items-center justify-between border-t border-border/60 px-5 py-3 text-sm first:border-0">
                    <div>
                      <p className="font-medium">{i.title}</p>
                      <p className="text-xs text-muted-foreground">Reported by {i.reportedBy.name}</p>
                    </div>
                    <Badge tone={statusTone(i.status)}>{i.status.replace("_", " ")}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
