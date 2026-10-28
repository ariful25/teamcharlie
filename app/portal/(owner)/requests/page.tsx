import { getPortalUser } from "@/lib/portal/session";
import { portalOverview } from "@/lib/portal/queries";
import { REQUEST_KIND_LABEL, portalDate } from "@/lib/portal/rules";
import { Badge } from "@/components/ui/badge";
import { RequestForm } from "@/components/portal/request-form";

const STATUS = { OPEN: ["With your team", "warning"], DONE: ["Done", "success"], DECLINED: ["Not done", "neutral"] } as const;

export default async function PortalRequestsPage() {
  const owner = await getPortalUser();
  const { listings, requests } = await portalOverview(owner);
  const nameOf = new Map(listings.map((l) => [l.id, l.listingName ?? l.internalName]));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">Ask your team to change something. It goes straight onto their task list.</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-golden-r">
        <section className="glass space-y-5 rounded-2xl p-5">
          <h2 className="font-display text-lg font-semibold">New request</h2>
          <RequestForm listings={listings.map((l) => ({ id: l.id, name: l.listingName ?? l.internalName }))} />
        </section>
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold">Your requests</h2>
          {requests.length === 0 ? (
            <p className="glass rounded-2xl p-5 text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <ul className="space-y-3">
              {requests.map((r) => {
                const [label, tone] = STATUS[r.status];
                return (
                  <li key={r.id} className="glass rounded-2xl p-5">
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <Badge tone={tone}>{label}</Badge>
                      <span>{REQUEST_KIND_LABEL[r.kind]}</span>
                      {r.propertyId && <span>{nameOf.get(r.propertyId) ?? "·"}</span>}
                      <span>{portalDate(r.createdAt)}</span>
                      {r.resolvedAt && <span>done {portalDate(r.resolvedAt)}</span>}
                    </div>
                    <p className="mt-2 whitespace-pre-line text-sm">{r.message}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
