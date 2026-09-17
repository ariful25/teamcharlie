import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clientCreateSchema } from "@/lib/validations";
import { createClientSpreadsheet } from "@/lib/google-sheets/spreadsheet";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamId = (session.user as any).teamId as string;
  const clients = await prisma.client.findMany({ where: { teamId, active: true }, orderBy: { name: "asc" } });
  return NextResponse.json({ clients });
}

// Every generic Charlie HQ module (Tasks, Issues, Properties, Leads,
// Knowledge Base) already scopes its own queries by clientId + the client's
// teamId, so a new Client row is immediately usable everywhere the moment
// it exists — see those modules' API routes. Nothing else needs to be
// created for a client to "have" Tasks/Issues/Properties/Leads/Knowledge
// Base; there's no per-module row to initialize.
//
// The only things that DO need explicit provisioning at creation time are
// the capability-selection records for Step 3 of the wizard (which
// integrations this client can use) — done here in one transaction so a
// client can never end up half-created (client exists, integration rows
// missing, or vice versa).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!permissions.canManageClients(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = (session.user as any).teamId as string;
  const parsed = clientCreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { integrations, createGoogleSheet, ...clientData } = parsed.data;
  // De-duplicate in case the client sent the same provider twice — the
  // @@unique([clientId, provider]) constraint would reject that anyway,
  // but failing the whole transaction over a duplicate checkbox click isn't
  // useful.
  const uniqueIntegrations = Array.from(new Set(integrations));

  try {
    const client = await prisma.$transaction(async (tx) => {
      const created = await tx.client.create({ data: { ...clientData, teamId } });
      if (uniqueIntegrations.length > 0) {
        await tx.clientIntegration.createMany({
          data: uniqueIntegrations.map((provider) => ({
            clientId: created.id,
            provider,
            status: "NOT_CONNECTED" as const,
          })),
        });
      }
      return created;
    });

    // Spreadsheet creation is several real Google API calls (create file,
    // write headers, hide a sheet, share permissions) — deliberately kept
    // outside the DB transaction and best-effort, so a slow or failing
    // Google Sheets call never rolls back (or blocks) client creation
    // itself. createClientSpreadsheet already records ERROR status with a
    // message on failure, visible from the client workspace's Google
    // Knowledge Base panel, with a retry button.
    if (createGoogleSheet) {
      createClientSpreadsheet(client.id).catch((err) => console.error("Google Sheets creation failed", err));
    }

    return NextResponse.json({ client });
  } catch (err) {
    console.error("Failed to create client", err);
    return NextResponse.json({ error: "Could not create this client. Please try again." }, { status: 500 });
  }
}
