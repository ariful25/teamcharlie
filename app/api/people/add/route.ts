import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserOrNull } from "@/lib/session";
import { permissions } from "@/lib/auth";
import { addPeopleSchema } from "@/lib/validations";
import { AddPeopleError, addPeople } from "@/lib/people/add-service";

// The Add people dialog: one person or a pasted list, by invite link or a
// temporary password. Admin and HR add to any team; leads to their own.
export async function POST(req: NextRequest) {
  const user = await getCurrentUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!permissions.canAddPeople(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = addPeopleSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  try {
    // The address the person adding is on, so links never point at localhost.
    const results = await addPeople(user, parsed.data, req.nextUrl.origin);
    return NextResponse.json({ results });
  } catch (err) {
    if (err instanceof AddPeopleError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("add people", err);
    return NextResponse.json({ error: "Couldn't add those people." }, { status: 500 });
  }
}
