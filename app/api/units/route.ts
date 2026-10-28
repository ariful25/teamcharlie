import { walls, type ClientWall } from "@/lib/scope";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unitSchema } from "@/lib/validations";

async function propertyForTeam(propertyId: string, clientWall: ClientWall) {
  return prisma.property.findFirst({ where: { id: propertyId, client: clientWall } });
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { teamId, clientWall } = await walls();
  const propertyId = req.nextUrl.searchParams.get("propertyId") ?? undefined;
  const units = await prisma.unit.findMany({
    where: { active: true, property: { client: clientWall }, ...(propertyId ? { propertyId } : {}) },
    include: { property: true, tenancies: true },
    orderBy: { internalName: "asc" },
  });

  return NextResponse.json({ units });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = session.user.role;
  if (!permissions.canManageProperties(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { teamId, clientWall } = await walls();
  const parsed = unitSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  if (!(await propertyForTeam(parsed.data.propertyId, clientWall))) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }
  if (parsed.data.parentUnitId) {
    const parent = await prisma.unit.findFirst({
      where: { id: parsed.data.parentUnitId, property: { client: clientWall } },
    });
    if (!parent) return NextResponse.json({ error: "Parent unit not found" }, { status: 404 });
  }

  const unit = await prisma.unit.create({ data: parsed.data });
  return NextResponse.json({ unit });
}
