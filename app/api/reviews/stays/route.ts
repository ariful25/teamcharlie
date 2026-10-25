import { NextRequest, NextResponse } from "next/server";
import { createStay } from "@/lib/reviews/service";
import { listingHealthErrorResponse, requireListingManager } from "@/lib/listing-health/http";

// Add a stay by hand (bookings from before email sync, or another channel).
export async function POST(req: NextRequest) {
  const auth = await requireListingManager();
  if (auth.error) return auth.error;
  try {
    const stay = await createStay(auth.user.teamId, auth.user.id, await req.json().catch(() => ({})));
    return NextResponse.json({ id: stay.id });
  } catch (err) {
    return listingHealthErrorResponse(err, "Couldn't add the stay.");
  }
}
