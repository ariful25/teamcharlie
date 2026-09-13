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
    prepared[field] = prepared[field] ? new Date(prepared[field]) : null;
  }
  for (const field of moneyFields) {
    prepared[field] = prepared[field] === "" || prepared[field] == null ? null : prepared[field];
  }
  return prepared;
}

async function unitForTeam(unitId: string, teamId: string) {
  return prisma.unit.findFirst({ where: { id: unitId, property: { client: { teamId } } } });
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamId = (session.user as any).teamId as string;
  const unitId = req.nextUrl.searchParams.get("unitId") ?? undefined;
  const tenancies = await prisma.tenancy.findMany({
    where: { unit: { property: { client: { teamId } } }, ...(unitId ? { unitId } : {}) },
    include: { unit: { include: { property: true } } },
    orderBy: [{ moveInDate: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ tenancies });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!permissions.canManageProperties(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = (session.user as any).teamId as string;
  const parsed = tenancySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  if (!(await unitForTeam(parsed.data.unitId, teamId))) {
    return NextResponse.json({ error: "Unit not found" }, { status: 404 });
  }

  const tenancy = await prisma.tenancy.create({ data: prepareTenancyData(parsed.data) });
  return NextResponse.json({ tenancy });
}
