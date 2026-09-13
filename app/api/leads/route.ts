import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { leadSchema } from "@/lib/validations";

function prepareLeadData(data: any) {
  return { ...data, contactedDate: data.contactedDate ? new Date(data.contactedDate) : null };
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamId = (session.user as any).teamId as string;
  const clientId = req.nextUrl.searchParams.get("clientId") ?? undefined;
  const leads = await prisma.lead.findMany({
    where: { client: { teamId }, ...(clientId ? { clientId } : {}) },
    include: { interestedUnit: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ leads });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!permissions.canManageProperties(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = (session.user as any).teamId as string;
  const parsed = leadSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const client = await prisma.client.findFirst({ where: { id: parsed.data.clientId, teamId } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  if (parsed.data.interestedUnitId) {
    const unit = await prisma.unit.findFirst({
      where: { id: parsed.data.interestedUnitId, property: { client: { teamId } } },
    });
    if (!unit) return NextResponse.json({ error: "Interested unit not found" }, { status: 404 });
  }

  const lead = await prisma.lead.create({ data: prepareLeadData(parsed.data) });
  return NextResponse.json({ lead });
}
