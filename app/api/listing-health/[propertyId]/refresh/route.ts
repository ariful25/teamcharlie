import { NextRequest, NextResponse } from "next/server";
import { refreshListingHealth } from "@/lib/listing-health/service";
import { listingHealthErrorResponse, requireListingManager } from "@/lib/listing-health/http";

// One listing per request (stays well inside the serverless time limit);
// the portfolio page loops over listings with a small concurrency.
export async function POST(req: NextRequest, props: { params: Promise<{ propertyId: string }> }) {
  const params = await props.params;
  const auth = await requireListingManager({ propertyId: params.propertyId });
  if (auth.error) return auth.error;
  const force = req.nextUrl.searchParams.get("force") === "true";
  try {
    const { snapshot, cached } = await refreshListingHealth(params.propertyId, auth.user.teamId, { force });
    return NextResponse.json({ ok: snapshot.ok, cached, error: snapshot.error });
  } catch (err) {
    return listingHealthErrorResponse(err, "Health check failed.");
  }
}
