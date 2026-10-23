import { NextRequest, NextResponse } from "next/server";
import { deleteReview } from "@/lib/listing-health/service";
import { listingHealthErrorResponse, requireListingManager } from "@/lib/listing-health/http";

// Remove a wrongly imported/added review.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireListingManager();
  if (auth.error) return auth.error;
  try {
    await deleteReview(auth.user.teamId, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return listingHealthErrorResponse(err, "Could not delete the review.");
  }
}
