import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge, statusTone } from "@/components/ui/badge";
import { IssueFormModal } from "@/components/issues/issue-form-modal";
import { IssueStatusButton } from "@/components/issues/issue-status-button";

export default async function IssuesPage() {
  const currentUser = await getCurrentUser();
  const teamId = currentUser.teamId;

  const [issues, clients] = await Promise.all([
    prisma.issue.findMany({
      where: { teamId },
      include: { client: true, reportedBy: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.client.findMany({ where: { teamId, active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Issues</h1>
          <p className="mt-1 text-sm text-muted-foreground">Open problems across clients and internal operations.</p>
        </div>
        <IssueFormModal clients={clients.map((c) => ({ id: c.id, name: c.name }))} />
      </div>

      {issues.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">No issues reported. 🎉</Card>
      ) : (
        <div className="space-y-2">
          {issues.map((issue) => (
            <Card key={issue.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">{issue.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {issue.client?.name ?? "Internal"} · Reported by {issue.reportedBy.name}
                </p>
                {issue.description && <p className="mt-1 text-sm text-muted-foreground">{issue.description}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={issue.severity === "CRITICAL" || issue.severity === "HIGH" ? "danger" : "neutral"}>
                  {issue.severity}
                </Badge>
                <IssueStatusButton issue={issue} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
