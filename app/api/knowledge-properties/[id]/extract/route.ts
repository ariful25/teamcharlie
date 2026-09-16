import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractAirbnbListing } from "@/lib/services/airbnb-extractor";
import { computeCompletionPct, mergeAirbnbExtraction } from "@/lib/services/property-knowledge";

// Gives the route headroom up to 30s on Vercel plans that honor maxDuration
// (Hobby caps this at 60s max, Pro/Enterprise higher) — harmless on plans
// that ignore it. The extractor's own 8s AbortController timeout still fires
// well before this, so this is a ceiling, not the expected duration.
export const maxDuration = 30;

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
  if (existing.status === "EXTRACTING") {
    return NextResponse.json({ error: "Extraction is already running for this property." }, { status: 409 });
  }

  await prisma.propertyKnowledgeItem.update({
    where: { id: existing.id },
    data: { status: "EXTRACTING", extractionError: null },
  });

  try {
    const extracted = await extractAirbnbListing(existing.airbnbUrl);
    // Only fields that are still blank get filled in — anything already
    // set (manually, or by a prior extraction) is left untouched. See
    // mergeAirbnbExtraction for why.
    const patch = mergeAirbnbExtraction(existing, extracted);
    const merged = { ...existing, ...patch };
    const item = await prisma.propertyKnowledgeItem.update({
      where: { id: existing.id },
      data: {
        ...patch,
        completionPct: computeCompletionPct(merged),
        status: "NEEDS_REVIEW",
        extractedAt: new Date(),
        extractionError: null,
      },
    });
    return NextResponse.json({ item });
  } catch (err: any) {
    const message = err?.message ?? "Could not extract Airbnb listing";
    const item = await prisma.propertyKnowledgeItem.update({
      where: { id: existing.id },
      data: {
        status: "FAILED",
        extractionError: message,
      },
    });
    return NextResponse.json({ item, error: message }, { status: 502 });
  }
}
