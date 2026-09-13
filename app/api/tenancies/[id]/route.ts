import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tenancySchema } from "@/lib/validations";

const dateFields = ["moveInDate", "moveOutDate", "nextTenantMoveIn", "nextTenantMoveOut"] as const;
const moneyFields = ["rentAmount", "securityDeposit", "cleaningFee", "petFee", "amountDue"] as const;

function prepareTenancyData(data: any) {
  const prepared = { ...data };
  for (const field of dateFields) {
    if (field in prepared) prepared[field] = prepared[field] ? new Date(prepared[field]) : null;
  }
  for (const field of moneyFields) {
    if (field in prepared) prepared[field] = prepared[field] === "" || prepared[field] == null ? null : prepared[field];
  }
  return prepared;
}

async function canAccessTenancy(id: string, teamId: string) {
  return prisma.tenancy.findFirst({ where: { id, unit: { property: { client: { teamId } } } } });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!permissions.canManageProperties(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = (session.user as any).teamId as string;
  const existing = await canAccessTenancy(params.id, teamId);
  if (!existing) return NextResponse.json({ error: "Tenancy not found" }, { status: 404 });

  const parsed = tenancySchema.partial().safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  if (parsed.data.unitId) {
    const unit = await prisma.unit.findFirst({ where: { id: parsed.data.unitId, property: { client: { teamId } } } });
    if (!unit) return NextResponse.json({ error: "Unit not found" }, { status: 404 });
  }

  const tenancy = await prisma.tenancy.update({ where: { id: params.id }, data: prepareTenancyData(parsed.data) });
  return NextResponse.json({ tenancy });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!permissions.canManageProperties(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = (session.user as any).teamId as string;
  const existing = await canAccessTenancy(params.id, teamId);
  if (!existing) return NextResponse.json({ error: "Tenancy not found" }, { status: 404 });

  await prisma.tenancy.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
