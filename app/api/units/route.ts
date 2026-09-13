import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unitSchema } from "@/lib/validations";

async function propertyForTeam(propertyId: string, teamId: string) {
  return prisma.property.findFirst({ where: { id: propertyId, client: { teamId } } });
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamId = (session.user as any).teamId as string;
  const propertyId = req.nextUrl.searchParams.get("propertyId") ?? undefined;
  const units = await prisma.unit.findMany({
    where: { active: true, property: { client: { teamId } }, ...(propertyId ? { propertyId } : {}) },
    include: { property: true, tenancies: true },
    orderBy: { internalName: "asc" },
  });

  return NextResponse.json({ units });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!permissions.canManageProperties(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = (session.user as any).teamId as string;
  const parsed = unitSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  if (!(await propertyForTeam(parsed.data.propertyId, teamId))) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }
  if (parsed.data.parentUnitId) {
    const parent = await prisma.unit.findFirst({
      where: { id: parsed.data.parentUnitId, property: { client: { teamId } } },
    });
    if (!parent) return NextResponse.json({ error: "Parent unit not found" }, { status: 404 });
  }

  const unit = await prisma.unit.create({ data: parsed.data });
  return NextResponse.json({ unit });
}
