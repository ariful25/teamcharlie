import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { saveTemplate } from "@/lib/reviews/service";
import { listingHealthErrorResponse, requireListingManager } from "@/lib/listing-health/http";

const schema = z.object({ key: z.string(), body: z.string().nullable() });

// Save a team's message template; body null restores the default.
export async function PUT(req: NextRequest) {
  const auth = await requireListingManager();
  if (auth.error) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    await saveTemplate(auth.user.teamId, parsed.data.key, parsed.data.body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return listingHealthErrorResponse(err, "Couldn't save the template.");
  }
}
