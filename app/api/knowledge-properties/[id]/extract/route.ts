import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractAirbnbListing } from "@/lib/services/airbnb-extractor";

function completionPct(data: Record<string, any>) {
  const fields = [
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
  const completed = fields.filter((field) => {
    const value = data[field];
    return Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== "";
  }).length;
  return Math.round((completed / fields.length) * 100);
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!permissions.canManageKnowledgeBase(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = (session.user as any).teamId as string;
  const existing = await prisma.propertyKnowledgeItem.findFirst({
    where: { id: params.id, client: { teamId } },
  });
  if (!existing) return NextResponse.json({ error: "Property not found" }, { status: 404 });

  await prisma.propertyKnowledgeItem.update({
    where: { id: existing.id },
    data: { status: "EXTRACTING", extractionError: null },
  });

  try {
    const extracted = await extractAirbnbListing(existing.airbnbUrl);
    const merged = { ...existing, ...extracted };
    const item = await prisma.propertyKnowledgeItem.update({
      where: { id: existing.id },
      data: {
        ...extracted,
        completionPct: completionPct(merged),
        status: "NEEDS_REVIEW",
        extractedAt: new Date(),
        extractionError: null,
      },
    });
    return NextResponse.json({ item });
  } catch (err: any) {
    const item = await prisma.propertyKnowledgeItem.update({
      where: { id: existing.id },
      data: {
        status: "FAILED",
        extractionError: err?.message ?? "Could not extract Airbnb listing",
      },
    });
    return NextResponse.json({ item, error: item.extractionError }, { status: 502 });
  }
}
