import { NextRequest, NextResponse } from "next/server";
import { getPortalUserOrNull } from "@/lib/portal/session";
import { clientRequestSchema } from "@/lib/validations";
import { createClientRequest } from "@/lib/portal/requests";
import { allowRequest } from "@/lib/rate-limit";

// An owner asks their team for something. It becomes a task on the team's
// board; the owner never edits live data.
export async function POST(req: NextRequest) {
  const owner = await getPortalUserOrNull();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await allowRequest(`portal-request:${owner.id}`, 30, 24 * 60 * 60 * 1000))) {
    return NextResponse.json({ error: "That's a lot of requests for one day. Message your team directly." }, { status: 429 });
  }
  const parsed = clientRequestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const request = await createClientRequest(owner, parsed.data);
  if (!request) return NextResponse.json({ error: "That listing isn't yours." }, { status: 404 });
  return NextResponse.json({ request });
}
