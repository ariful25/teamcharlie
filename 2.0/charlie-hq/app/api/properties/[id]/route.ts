import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { propertySchema } from "@/lib/validations";

async function canAccessProperty(id: string, teamId: string) {
  return prisma.property.findFirst({ where: { id, client: { teamId } } });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!permissions.canManageProperties(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = (session.user as any).teamId as string;
  const existing = await canAccessProperty(params.id, teamId);
  if (!existing) return NextResponse.json({ error: "Property not found" }, { status: 404 });

  const parsed = propertySchema.partial().safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  if (parsed.data.clientId) {
    const client = await prisma.client.findFirst({ where: { id: parsed.data.clientId, teamId } });
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const property = await prisma.property.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json({ property });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!permissions.canManageProperties(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = (session.user as any).teamId as string;
  const existing = await canAccessProperty(params.id, teamId);
  if (!existing) return NextResponse.json({ error: "Property not found" }, { status: 404 });

  const property = await prisma.property.update({ where: { id: params.id }, data: { active: false } });
  await prisma.unit.updateMany({ where: { propertyId: params.id }, data: { active: false } });
  return NextResponse.json({ property });
}
