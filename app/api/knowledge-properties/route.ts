import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions, permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { propertyKnowledgeItemSchema } from "@/lib/validations";
import { computeCompletionPct, normalizeAirbnbUrl } from "@/lib/services/property-knowledge";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamId = (session.user as any).teamId as string;
  const clientId = req.nextUrl.searchParams.get("clientId") ?? undefined;
  const status = req.nextUrl.searchParams.get("status") ?? undefined;

  const items = await prisma.propertyKnowledgeItem.findMany({
    where: {
      client: { teamId },
      ...(clientId ? { clientId } : {}),
      ...(status ? { status: status as any } : {}),
    },
    include: { client: true },
    orderBy: [{ createdAt: "desc" }],
  });

  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!permissions.canManageKnowledgeBase(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = (session.user as any).teamId as string;
  const parsed = propertyKnowledgeItemSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const client = await prisma.client.findFirst({ where: { id: parsed.data.clientId, teamId } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // normalizeAirbnbUrl only returns null for a non-Airbnb URL, which the
  // zod schema already rejected above, but guard defensively anyway.
  const normalized = normalizeAirbnbUrl(parsed.data.airbnbUrl);
  if (!normalized) {
    return NextResponse.json({ error: "Enter a valid Airbnb listing URL" }, { status: 400 });
  }

  const data = {
    ...parsed.data,
    airbnbUrl: normalized.url,
    airbnbListingId: normalized.listingId,
  };

  try {
    const item = await prisma.propertyKnowledgeItem.create({
      data: {
        ...data,
        completionPct: computeCompletionPct(data),
      },
    });
    return NextResponse.json({ item });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "This Airbnb listing is already imported for this client." }, { status: 409 });
    }
    console.error("Failed to create property knowledge item", err);
    return NextResponse.json({ error: "Could not save this property. Please try again." }, { status: 500 });
  }
}
