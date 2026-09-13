import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { leadSchema } from "@/lib/validations";

function prepareLeadData(data: any) {
  return "contactedDate" in data ? { ...data, contactedDate: data.contactedDate ? new Date(data.contactedDate) : null } : data;
}

async function canAccessLead(id: string, teamId: string) {
  return prisma.lead.findFirst({ where: { id, client: { teamId } } });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!permissions.canManageProperties(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = (session.user as any).teamId as string;
  const existing = await canAccessLead(params.id, teamId);
  if (!existing) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const parsed = leadSchema.partial().safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  if (parsed.data.clientId) {
    const client = await prisma.client.findFirst({ where: { id: parsed.data.clientId, teamId } });
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }
  if (parsed.data.interestedUnitId) {
    const unit = await prisma.unit.findFirst({
      where: { id: parsed.data.interestedUnitId, property: { client: { teamId } } },
    });
    if (!unit) return NextResponse.json({ error: "Interested unit not found" }, { status: 404 });
  }

  const lead = await prisma.lead.update({ where: { id: params.id }, data: prepareLeadData(parsed.data) });
  return NextResponse.json({ lead });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!permissions.canManageProperties(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = (session.user as any).teamId as string;
  const existing = await canAccessLead(params.id, teamId);
  if (!existing) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  await prisma.lead.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
