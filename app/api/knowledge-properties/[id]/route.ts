import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { propertyKnowledgeItemSchema } from "@/lib/validations";

const COMPLETION_FIELDS = [
  "listingName",
  "description",
  "amenities",
  "propertyType",
  "location",
  "guestCapacity",
  "bedrooms",
  "bathrooms",
  "beds",
  "rules",
  "wifiName",
  "wifiPassword",
  "doorCode",
  "parkingInfo",
  "checkInInfo",
  "checkoutInfo",
  "internalNotes",
];

async function getItemForTeam(id: string, teamId: string) {
  return prisma.propertyKnowledgeItem.findFirst({ where: { id, client: { teamId } } });
}

function completionPct(data: Record<string, any>) {
  const completed = COMPLETION_FIELDS.filter((field) => {
    const value = data[field];
    return Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== "";
  }).length;
  return Math.round((completed / COMPLETION_FIELDS.length) * 100);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!permissions.canManageKnowledgeBase(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = (session.user as any).teamId as string;
  const existing = await getItemForTeam(params.id, teamId);
  if (!existing) return NextResponse.json({ error: "Property not found" }, { status: 404 });

  const parsed = propertyKnowledgeItemSchema.partial().safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  if (parsed.data.clientId) {
    const client = await prisma.client.findFirst({ where: { id: parsed.data.clientId, teamId } });
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const merged = { ...existing, ...parsed.data };
  const item = await prisma.propertyKnowledgeItem.update({
    where: { id: params.id },
    data: {
      ...parsed.data,
      completionPct: completionPct(merged),
    },
  });

  return NextResponse.json({ item });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!permissions.canManageKnowledgeBase(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = (session.user as any).teamId as string;
  const existing = await getItemForTeam(params.id, teamId);
  if (!existing) return NextResponse.json({ error: "Property not found" }, { status: 404 });

  await prisma.propertyKnowledgeItem.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
