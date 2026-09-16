import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions, permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { propertyKnowledgeItemSchema } from "@/lib/validations";
import { computeCompletionPct, normalizeAirbnbUrl } from "@/lib/services/property-knowledge";

async function getItemForTeam(id: string, teamId: string) {
  return prisma.propertyKnowledgeItem.findFirst({ where: { id, client: { teamId } } });
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

  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.airbnbUrl) {
    const normalized = normalizeAirbnbUrl(parsed.data.airbnbUrl);
    if (!normalized) {
      return NextResponse.json({ error: "Enter a valid Airbnb listing URL" }, { status: 400 });
    }
    data.airbnbUrl = normalized.url;
    data.airbnbListingId = normalized.listingId;
  }

  const merged = { ...existing, ...data };

  try {
    const item = await prisma.propertyKnowledgeItem.update({
      where: { id: params.id },
      data: {
        ...data,
        completionPct: computeCompletionPct(merged),
      },
    });
    return NextResponse.json({ item });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "This Airbnb listing is already imported for this client." }, { status: 409 });
    }
    console.error("Failed to update property knowledge item", err);
    return NextResponse.json({ error: "Could not save this property. Please try again." }, { status: 500 });
  }
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
