import { getScope } from "@/lib/scope";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserOrNull } from "@/lib/session";
import { addReview } from "@/lib/listing-health/service";
import { lowStarReviews } from "@/lib/listing-health/queries";
import { listingHealthErrorResponse, reachesTarget, requireListingManager, targetNotFound } from "@/lib/listing-health/http";

const schema = z.object({
  propertyId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(2, "Paste the review text").max(5000),
  guestName: z.string().max(120).optional().nullable(),
  reviewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  privateNote: z.string().max(5000).optional().nullable(),
});

// Add one review by hand (e.g. copied from the Airbnb host dashboard).
export async function POST(req: NextRequest) {
  const auth = await requireListingManager();
  if (auth.error) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  if (!(await reachesTarget(auth.user, { propertyId: parsed.data.propertyId }))) return targetNotFound();
  try {
    const review = await addReview({ teamId: auth.user.teamId, actorId: auth.user.id, ...parsed.data });
    return NextResponse.json({ review });
  } catch (err) {
    return listingHealthErrorResponse(err, "Could not save the review.");
  }
}

function csvCell(value: string | number | null | undefined) {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// The "list of 4★/3★/2★/1★ reviews" as a CSV, e.g. ?clientId=…&maxRating=4.
export async function GET(req: NextRequest) {
  const user = await getCurrentUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const clientId = req.nextUrl.searchParams.get("clientId") ?? "";
  const maxRating = Math.min(5, Math.max(1, Number(req.nextUrl.searchParams.get("maxRating") ?? 4)));
  const reviews = await lowStarReviews(await getScope(user), clientId, maxRating);
  const header = ["Stars", "Listing", "Airbnb title", "Date", "Guest", "Review", "Private feedback", "Airbnb URL"];
  const lines = reviews.map((r) =>
    [r.rating, r.property.internalName, r.property.listingName, r.reviewDate?.toISOString().slice(0, 10) ?? "", r.guestName, r.comment, r.privateNote, r.property.airbnbUrl]
      .map(csvCell)
      .join(",")
  );
  return new NextResponse([header.join(","), ...lines].join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="reviews-${maxRating}-stars-and-below.csv"`,
    },
  });
}
