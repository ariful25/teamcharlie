import { NextRequest, NextResponse } from "next/server";
import { inboundSchema, teamForToken } from "@/lib/listing-health/inbox";
import { ingestAirbnbEmails } from "@/lib/reviews/service";

// Called hourly by the team's Google Apps Script (Settings → Review email
// sync) with Airbnb reservation and review emails from their Gmail (never
// guest messages). No session: the bearer
// token identifies the team, and only its SHA-256 hash is stored.
export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  const teamId = await teamForToken(token);
  if (!teamId) return NextResponse.json({ error: "Unknown or revoked sync token." }, { status: 401 });

  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > 4_000_000) return NextResponse.json({ error: "Batch too large. Send fewer emails per call." }, { status: 413 });
  const parsed = inboundSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Expected { messages: [{ id, subject, from, date, body }] }." }, { status: 400 });

  try {
    return NextResponse.json(await ingestAirbnbEmails(teamId, parsed.data.messages));
  } catch (err) {
    console.error("inbound reviews", err);
    return NextResponse.json({ error: "Could not store those emails." }, { status: 500 });
  }
}
