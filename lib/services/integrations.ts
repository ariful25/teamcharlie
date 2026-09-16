// The integration capability registry: what Charlie HQ *knows about*, as
// opposed to what it can actually connect to. As of this module, there is
// no real OAuth/API connector implemented for any provider here — every
// row starts and stays NOT_CONNECTED until a human with ADMIN access
// records that they set the connection up outside Charlie HQ (the same
// manually-tracked-fact pattern TeamSettings already uses for Discord
// webhooks). Nothing in this file, or anything that calls it, is allowed to
// report a provider as CONNECTED on its own — that would be exactly the
// kind of fake "Connected" state the product spec forbids.
import { prisma } from "@/lib/prisma";
import { INTEGRATION_LABELS, INTEGRATION_PROVIDERS } from "@/lib/validations";

export type IntegrationProviderId = (typeof INTEGRATION_PROVIDERS)[number];

export { INTEGRATION_LABELS };

// Every one of these is listed as "Do Not Build Yet" in the Module 1 spec
// (Airbnb/Guestly/WhatsApp/ClickUp API integrations) or was never scoped at
// all (Enso, HostBuddy, Google Drive/Sheets, Notion) — so none has real
// connector code. This flag exists purely so the UI can say "no automated
// Test Connection exists for this provider yet" honestly instead of a
// generic error.
export const INTEGRATION_HAS_CONNECTOR: Record<IntegrationProviderId, boolean> = {
  GUESTY: false,
  AIRBNB: false,
  CLICKUP: false,
  WHATSAPP: false,
  ENSO: false,
  HOSTBUDDY: false,
  GOOGLE_DRIVE: false,
  GOOGLE_SHEETS: false,
  NOTION: false,
  OTHER: false,
};

export type ClientIntegrationOverviewRow = {
  provider: IntegrationProviderId;
  label: string;
  hasConnector: boolean;
  // null when the client has never enabled this provider's capability —
  // distinct from a NOT_CONNECTED row, which means it was enabled but isn't
  // hooked up yet.
  record: {
    id: string;
    status: "NOT_CONNECTED" | "NEEDS_AUTHORIZATION" | "CONNECTED" | "ERROR";
    note: string | null;
    connectedAt: Date | null;
    lastCheckedAt: Date | null;
    lastError: string | null;
  } | null;
};

// Merges the full provider registry with whatever ClientIntegration rows
// actually exist for this client, so the UI always lists every supported
// provider — including ones the client has never touched — rather than
// only ones with a database row.
export async function getClientIntegrationOverview(clientId: string): Promise<ClientIntegrationOverviewRow[]> {
  const rows = await prisma.clientIntegration.findMany({ where: { clientId } });
  const byProvider = new Map(rows.map((row) => [row.provider, row]));

  return INTEGRATION_PROVIDERS.map((provider) => {
    const record = byProvider.get(provider);
    return {
      provider,
      label: INTEGRATION_LABELS[provider],
      hasConnector: INTEGRATION_HAS_CONNECTOR[provider],
      record: record
        ? {
            id: record.id,
            status: record.status,
            note: record.note,
            connectedAt: record.connectedAt,
            lastCheckedAt: record.lastCheckedAt,
            lastError: record.lastError,
          }
        : null,
    };
  });
}
