import { NextRequest, NextResponse } from "next/server";
import { updateReview } from "@/lib/reviews/service";
import { listingHealthErrorResponse, requireListingManager } from "@/lib/listing-health/http";

// Edit a saved review: rating, text, guest, private note, "responded".
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireListingManager();
  if (auth.error) return auth.error;
  try {
    await updateReview(auth.user.teamId, params.id, await req.json().catch(() => ({})));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return listingHealthErrorResponse(err, "Couldn't save the review.");
  }
}
