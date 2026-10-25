import { NextRequest, NextResponse } from "next/server";
import { applyStayAction } from "@/lib/reviews/service";
import { listingHealthErrorResponse, requireListingManager } from "@/lib/listing-health/http";

// Move a stay through the review pipeline: { action, note? }.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireListingManager();
  if (auth.error) return auth.error;
  try {
    await applyStayAction(auth.user.teamId, auth.user.id, params.id, await req.json().catch(() => ({})));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return listingHealthErrorResponse(err, "Couldn't update the stay.");
  }
}
