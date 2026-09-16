// The client-scoped fetcher registry.
//
// Today there is exactly one real fetcher in Charlie HQ: public Airbnb
// listing extraction (lib/services/airbnb-extractor.ts), used by the
// Property Knowledge Base. This module exists to document — with a real,
// working example — the pattern any *future* fetcher (a Guesty sync, a
// ClickUp import, a Google Sheets export) should follow instead of the
// "bad architecture" the product spec called out:
//
//   if (client.name === "Andrea") { ... }
//
// A fetcher registered here never has to re-derive team/client ownership
// itself — fetchClientResource verifies `client.teamId === teamId` before
// the fetcher ever runs, so that check can't be forgotten by a future
// integration.
//
// app/api/knowledge-properties/[id]/extract intentionally keeps its own
// equivalent ownership check inline rather than being rewired through this
// registry — it's already correct and already tested, and rewiring
// working, audited code purely to prove out an abstraction isn't worth the
// regression risk. The next real fetcher should be added here instead.

import { prisma } from "@/lib/prisma";
import { extractAirbnbListing } from "@/lib/services/airbnb-extractor";

export type FetcherId = "AIRBNB_LISTING";

const FETCHERS: Record<FetcherId, (resource: string) => Promise<unknown>> = {
  AIRBNB_LISTING: (resource) => extractAirbnbListing(resource),
};

async function assertClientBelongsToTeam(clientId: string, teamId: string) {
  const client = await prisma.client.findFirst({ where: { id: clientId, teamId }, select: { id: true } });
  if (!client) throw new Error("Client not found for this team");
}

export async function fetchClientResource(args: {
  teamId: string;
  clientId: string;
  fetcher: FetcherId;
  resource: string;
}): Promise<unknown> {
  await assertClientBelongsToTeam(args.clientId, args.teamId);
  return FETCHERS[args.fetcher](args.resource);
}
