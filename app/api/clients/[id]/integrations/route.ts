import { walls, type ClientWall } from "@/lib/scope";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clientIntegrationCreateSchema, clientIntegrationUpdateSchema } from "@/lib/validations";
import { getClientIntegrationOverview } from "@/lib/services/integrations";

async function getClientForTeam(id: string, clientWall: ClientWall) {
  return prisma.client.findFirst({ where: { id, ...clientWall }, select: { id: true } });
}

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { teamId, clientWall } = await walls();
  const client = await getClientForTeam(params.id, clientWall);
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const integrations = await getClientIntegrationOverview(params.id);
  return NextResponse.json({ integrations });
}

// Enables a provider's capability for this client (creates a row at
// NOT_CONNECTED/NEEDS_AUTHORIZATION). This is the "Connect after creating
// client" step from the wizard, done later from the client workspace.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = session.user.role;
  if (!permissions.canManageIntegrations(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { teamId, clientWall } = await walls();
  const client = await getClientForTeam(params.id, clientWall);
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const parsed = clientIntegrationCreateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    const integration = await prisma.clientIntegration.upsert({
      where: { clientId_provider: { clientId: params.id, provider: parsed.data.provider } },
      update: {},
      create: { clientId: params.id, provider: parsed.data.provider, status: parsed.data.status },
    });
    return NextResponse.json({ integration });
  } catch (err) {
    console.error("Failed to enable integration", err);
    return NextResponse.json({ error: "Could not enable this integration. Please try again." }, { status: 500 });
  }
}
