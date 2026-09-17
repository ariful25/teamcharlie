import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createClientSpreadsheet } from "@/lib/google-sheets/spreadsheet";

async function getClientForTeam(id: string, teamId: string) {
  return prisma.client.findFirst({ where: { id, teamId }, select: { id: true } });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamId = (session.user as any).teamId as string;
  const client = await getClientForTeam(params.id, teamId);
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const [googleSheet, propertiesSynced] = await Promise.all([
    prisma.clientGoogleSheet.findUnique({ where: { clientId: params.id } }),
    prisma.propertyKnowledgeItem.count({ where: { clientId: params.id, googleSheetSyncedAt: { not: null } } }),
  ]);

  return NextResponse.json({ googleSheet, propertiesSynced });
}

// Creates the spreadsheet for a client that doesn't have one yet (e.g. the
// wizard's "Create Google Spreadsheet automatically" checkbox was off at
// creation time, or the first attempt errored) — same function client
// creation calls automatically, just invoked explicitly here.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!permissions.canManageGoogleSheets(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = (session.user as any).teamId as string;
  const client = await getClientForTeam(params.id, teamId);
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  try {
    const googleSheet = await createClientSpreadsheet(params.id);
    return NextResponse.json({ googleSheet });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Could not create the Google Spreadsheet." }, { status: 502 });
  }
}
