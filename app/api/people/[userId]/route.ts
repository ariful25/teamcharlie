import { NextRequest, NextResponse } from "next/server";
import { updateProfile } from "@/lib/people/service";
import { peopleActor, peopleErrorResponse } from "@/lib/people/http";

// Update profile fields. Which fields the caller may change is decided in
// updateProfile (lib/people/access.ts), not here.
export async function PATCH(req: NextRequest, props: { params: Promise<{ userId: string }> }) {
  const params = await props.params;
  const actor = await peopleActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const profile = await updateProfile(actor, params.userId, await req.json().catch(() => ({})));
    return NextResponse.json({ ok: true, updatedAt: profile?.updatedAt ?? null });
  } catch (err) {
    return peopleErrorResponse(err, "Could not save the profile.");
  }
}
