import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AiError } from "@/lib/ai/client";
import { generateCheckinGuide, generateCopy, generateInsights, generateReviewReply } from "@/lib/listing-health/ai";
import { requireListingManager } from "@/lib/listing-health/http";

// Runs one AI tool for a listing and saves the result (ListingAiNote).
// Leads/admins only — every call costs money on the team's own key.
export const maxDuration = 60;

const schema = z.object({
  kind: z.enum(["INSIGHTS", "CHECKIN_GUIDE", "COPY", "REVIEW_REPLY"]),
  reviewId: z.string().optional(),
});

export async function POST(req: NextRequest, props: { params: Promise<{ propertyId: string }> }) {
  const params = await props.params;
  const auth = await requireListingManager();
  if (auth.error) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { teamId, id: userId } = auth.user;
  try {
    const { kind, reviewId } = parsed.data;
    const note =
      kind === "INSIGHTS"
        ? await generateInsights(teamId, userId, params.propertyId)
        : kind === "CHECKIN_GUIDE"
          ? await generateCheckinGuide(teamId, userId, params.propertyId)
          : kind === "COPY"
            ? await generateCopy(teamId, userId, params.propertyId)
            : reviewId
              ? await generateReviewReply(teamId, userId, reviewId)
              : null;
    if (!note) return NextResponse.json({ error: "Which review?" }, { status: 400 });
    return NextResponse.json({ note: { id: note.id, kind: note.kind, content: note.content, model: note.model, createdAt: note.createdAt } });
  } catch (err) {
    if (err instanceof AiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "AI request failed." }, { status: 500 });
  }
}
