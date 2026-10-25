import { NextRequest, NextResponse } from "next/server";
import { resolveInboxItem } from "@/lib/listing-health/inbox";
import { listingHealthErrorResponse, requireListingManager } from "@/lib/listing-health/http";

// Finish an email the reader couldn't fully read (SAVE) or dismiss it (IGNORE).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireListingManager();
  if (auth.error) return auth.error;
  try {
    return NextResponse.json(await resolveInboxItem(auth.user.teamId, auth.user.id, params.id, await req.json().catch(() => ({}))));
  } catch (err) {
    return listingHealthErrorResponse(err, "Couldn't update that email.");
  }
}
