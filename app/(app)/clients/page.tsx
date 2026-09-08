import { getCurrentUser } from "@/lib/session";
import { ClientStatusCard } from "@/components/dashboard/client-status-card";
import { getDashboardData } from "@/lib/queries/dashboard";

export default async function ClientsIndexPage() {
  const currentUser = await getCurrentUser();
  const { clientStats } = await getDashboardData(currentUser.teamId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Clients</h1>
        <p className="mt-1 text-sm text-muted-foreground">Team Charlie's active client roster.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {clientStats.map((c) => (
          <ClientStatusCard key={c.id} {...c} />
        ))}
      </div>
    </div>
  );
}
