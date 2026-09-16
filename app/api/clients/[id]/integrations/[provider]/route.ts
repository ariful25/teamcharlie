import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clientIntegrationUpdateSchema, INTEGRATION_PROVIDERS } from "@/lib/validations";

// Manually records a connection fact for this client + provider — the same
// "a human is asserting this is true" pattern TeamSettings already uses for
// discordCheckinWebhookConfigured. This is never auto-set to CONNECTED by
// anything else in the app.
export async function PATCH(req: NextRequest, { params }: { params: { id: string; provider: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!permissions.canManageIntegrations(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!(INTEGRATION_PROVIDERS as readonly string[]).includes(params.provider)) {
    return NextResponse.json({ error: "Unknown integration provider" }, { status: 400 });
  }

  const teamId = (session.user as any).teamId as string;
  const client = await prisma.client.findFirst({ where: { id: params.id, teamId }, select: { id: true } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const parsed = clientIntegrationUpdateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const provider = params.provider as (typeof INTEGRATION_PROVIDERS)[number];
  const integration = await prisma.clientIntegration.upsert({
    where: { clientId_provider: { clientId: params.id, provider } },
    update: {
      status: parsed.data.status,
      note: parsed.data.note,
      connectedAt: parsed.data.status === "CONNECTED" ? new Date() : null,
      lastError: parsed.data.status === "ERROR" ? parsed.data.note ?? "Marked as error" : null,
    },
    create: {
      clientId: params.id,
      provider,
      status: parsed.data.status,
      note: parsed.data.note,
      connectedAt: parsed.data.status === "CONNECTED" ? new Date() : null,
      lastError: parsed.data.status === "ERROR" ? parsed.data.note ?? "Marked as error" : null,
    },
  });

  return NextResponse.json({ integration });
}
