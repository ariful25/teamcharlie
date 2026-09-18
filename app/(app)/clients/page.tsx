import { Building2 } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { permissions } from "@/lib/auth";
import { ClientStatusCard } from "@/components/dashboard/client-status-card";
import { AddClientWizard } from "@/components/clients/add-client-wizard";
import { getDashboardData } from "@/lib/queries/dashboard";

export default async function ClientsIndexPage() {
  const currentUser = await getCurrentUser();
  const { clientStats } = await getDashboardData(currentUser.teamId);
  const canManageClients = permissions.canManageClients(currentUser.role);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="mt-1 text-sm text-muted-foreground">Team Charlie&apos;s active client roster.</p>
        </div>
        {canManageClients && <AddClientWizard />}
      </div>
      {clientStats.length === 0 ? (
        <div className="glass flex flex-col items-center gap-3 rounded-2xl p-12 text-center shadow-card">
          <Building2 className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">No clients yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Create your first client workspace to get started.</p>
          </div>
          {canManageClients && <AddClientWizard />}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {clientStats.map((c) => (
            <ClientStatusCard key={c.id} {...c} />
          ))}
        </div>
      )}
    </div>
  );
}
