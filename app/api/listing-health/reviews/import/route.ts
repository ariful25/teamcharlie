import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { importReviews } from "@/lib/listing-health/service";
import { listingHealthErrorResponse, reachesTarget, requireListingManager, targetNotFound } from "@/lib/listing-health/http";

const schema = z.object({
  clientId: z.string().min(1),
  propertyId: z.string().optional().nullable(),
  csv: z.string().min(1, "The file is empty"),
});

export async function POST(req: NextRequest) {
  const auth = await requireListingManager();
  if (auth.error) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  if (!(await reachesTarget(auth.user, { clientId: parsed.data.clientId, propertyId: parsed.data.propertyId ?? undefined }))) return targetNotFound();
  try {
    const result = await importReviews({ teamId: auth.user.teamId, actorId: auth.user.id, ...parsed.data });
    return NextResponse.json(result);
  } catch (err) {
    return listingHealthErrorResponse(err, "Import failed.");
  }
}
