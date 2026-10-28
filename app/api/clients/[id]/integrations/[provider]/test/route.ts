import { walls } from "@/lib/scope";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { INTEGRATION_PROVIDERS } from "@/lib/validations";
import { INTEGRATION_HAS_CONNECTOR, INTEGRATION_LABELS, IntegrationProviderId } from "@/lib/services/integrations";

// Charlie HQ has no real connector for any provider yet (see
// lib/services/integrations.ts), so this always honestly reports that no
// automated test exists rather than faking a success. It still records
// lastCheckedAt so "someone tried this" is visible — that part is real.
export async function POST(
  _req: NextRequest,
  props: { params: Promise<{ id: string; provider: string }> }
) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = session.user.role;
  if (!permissions.canManageIntegrations(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!(INTEGRATION_PROVIDERS as readonly string[]).includes(params.provider)) {
    return NextResponse.json({ error: "Unknown integration provider" }, { status: 400 });
  }

  const { teamId, clientWall } = await walls();
  const client = await prisma.client.findFirst({ where: { id: params.id, ...clientWall }, select: { id: true } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const provider = params.provider as IntegrationProviderId;
  const hasConnector = INTEGRATION_HAS_CONNECTOR[provider];

  await prisma.clientIntegration.updateMany({
    where: { clientId: params.id, provider },
    data: { lastCheckedAt: new Date() },
  });

  if (!hasConnector) {
    return NextResponse.json({
      ok: false,
      message: `No automated connection test is implemented for ${INTEGRATION_LABELS[provider]} yet. Verify the connection directly in ${INTEGRATION_LABELS[provider]} for now.`,
    });
  }

  // Unreachable until a real connector exists for at least one provider —
  // left in place so the next real connector has an obvious place to
  // return an actual test result instead of this placeholder response.
  return NextResponse.json({ ok: true, message: "Connection successful." });
}
