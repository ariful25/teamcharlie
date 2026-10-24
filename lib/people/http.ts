import { NextResponse } from "next/server";
import { getCurrentUserOrNull } from "@/lib/session";
import { PeopleError } from "./service";

export async function peopleActor() {
  const user = await getCurrentUserOrNull();
  return user ? { id: user.id, role: user.role, teamId: user.teamId } : null;
}

export function peopleErrorResponse(err: unknown, fallback: string) {
  if (err instanceof PeopleError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error(fallback, err);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
