import { NextResponse } from "next/server";
import { getCurrentUserOrNull } from "@/lib/session";
import { permissions } from "@/lib/auth";
import { ListingHealthError } from "./service";

/** Signed-in user who may run checks / manage reviews, or an error response. */
export async function requireListingManager() {
  const user = await getCurrentUserOrNull();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!permissions.canManageKnowledgeBase(user.role)) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}

export function listingHealthErrorResponse(err: unknown, fallback: string) {
  if (err instanceof ListingHealthError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error(err);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
