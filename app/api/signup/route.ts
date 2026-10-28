import { NextRequest, NextResponse } from "next/server";
import { signupSchema } from "@/lib/validations";
import { createTeamWithAdmin, EmailTakenError, TeamNameTakenError } from "@/lib/services/team-onboarding";
import { allowRequest, clientIp } from "@/lib/rate-limit";

// Public: anyone can create a new team and becomes its first ADMIN. The
// browser then signs in with the same credentials (NextAuth credentials
// provider) — this route never issues a session itself.
export async function POST(req: NextRequest) {
  if (!(await allowRequest(`signup:${clientIp(req.headers)}`, 5, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many sign-up attempts. Try again in an hour." }, { status: 429 });
  }

  const parsed = signupSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const data = parsed.data;

  try {
    const { team } = await createTeamWithAdmin({
      teamName: data.teamName,
      timezone: data.timezone,
      adminName: data.name,
      email: data.email,
      password: data.password,
    });
    return NextResponse.json({ ok: true, teamSlug: team.slug });
  } catch (err) {
    if (err instanceof EmailTakenError) {
      return NextResponse.json({ error: "An account with that email already exists. Sign in instead." }, { status: 409 });
    }
    if (err instanceof TeamNameTakenError) {
      return NextResponse.json({ error: "A company with that name already exists. Try a different name." }, { status: 409 });
    }
    throw err;
  }
}
