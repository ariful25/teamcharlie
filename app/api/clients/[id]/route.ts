import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clientUpdateSchema } from "@/lib/validations";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamId = (session.user as any).teamId as string;
  const client = await prisma.client.findFirst({ where: { id: params.id, teamId } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  return NextResponse.json({ client });
}

// Handles both Edit Client (name/status/platforms/notes) and
// Deactivate/Reactivate Client (active: false/true) — deactivating never
// deletes anything. Historical tasks/properties/files/knowledge
// items keep their clientId and stay in the database; the client just
// disappears from active dropdowns (every list query already filters
// `active: true`, e.g. app/api/clients GET, lib/queries/tasks.ts,
// lib/queries/dashboard.ts, the knowledge-base page).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!permissions.canManageClients(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = (session.user as any).teamId as string;
  const existing = await prisma.client.findFirst({ where: { id: params.id, teamId } });
  if (!existing) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const parsed = clientUpdateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const client = await prisma.client.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json({ client });
}
