import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AiError } from "@/lib/ai/client";
import { readPastedReviews, savePastedReviews } from "@/lib/listing-health/inbox";
import { listingHealthErrorResponse, requireListingManager } from "@/lib/listing-health/http";

const readSchema = z.object({
  action: z.literal("read"),
  clientId: z.string().min(1),
  propertyId: z.string().optional().nullable(),
  text: z.string().min(1, "Paste some reviews first."),
  useAi: z.boolean().default(true),
});
const saveSchema = z.object({ action: z.literal("save"), clientId: z.string().min(1), rows: z.array(z.unknown()) });

// Pasted reviews: "read" returns a preview (nothing saved), "save" stores
// the rows the person confirmed.
export async function POST(req: NextRequest) {
  const auth = await requireListingManager();
  if (auth.error) return auth.error;
  const body = await req.json().catch(() => ({}));
  try {
    if (body?.action === "save") {
      const parsed = saveSchema.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
      return NextResponse.json(await savePastedReviews({ teamId: auth.user.teamId, actorId: auth.user.id, clientId: parsed.data.clientId, rows: parsed.data.rows }));
    }
    const parsed = readSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    return NextResponse.json(await readPastedReviews({ teamId: auth.user.teamId, userId: auth.user.id, ...parsed.data }));
  } catch (err) {
    if (err instanceof AiError) return NextResponse.json({ error: err.message }, { status: err.status });
    return listingHealthErrorResponse(err, "Couldn't read those reviews.");
  }
}
