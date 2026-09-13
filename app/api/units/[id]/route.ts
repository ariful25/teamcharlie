import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unitSchema } from "@/lib/validations";

async function canAccessUnit(id: string, teamId: string) {
  return prisma.unit.findFirst({ where: { id, property: { client: { teamId } } } });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!permissions.canManageProperties(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = (session.user as any).teamId as string;
  const existing = await canAccessUnit(params.id, teamId);
  if (!existing) return NextResponse.json({ error: "Unit not found" }, { status: 404 });

  const parsed = unitSchema.partial().safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  if (parsed.data.propertyId) {
    const property = await prisma.property.findFirst({ where: { id: parsed.data.propertyId, client: { teamId } } });
    if (!property) return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }
  if (parsed.data.parentUnitId) {
    const parent = await prisma.unit.findFirst({
      where: { id: parsed.data.parentUnitId, property: { client: { teamId } }, NOT: { id: params.id } },
    });
    if (!parent) return NextResponse.json({ error: "Parent unit not found" }, { status: 404 });
  }

  const unit = await prisma.unit.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json({ unit });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!permissions.canManageProperties(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = (session.user as any).teamId as string;
  const existing = await canAccessUnit(params.id, teamId);
  if (!existing) return NextResponse.json({ error: "Unit not found" }, { status: 404 });

  const unit = await prisma.unit.update({ where: { id: params.id }, data: { active: false } });
  return NextResponse.json({ unit });
}
