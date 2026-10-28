import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserOrNull } from "@/lib/session";
import { isCompanyWide } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SQUAD_COOKIE } from "@/lib/scope";

const schema = z.object({ squadId: z.string().min(1).nullable() });

// The team switcher for Admin and HR: which team every page shows. Only a
// view preference; access itself is decided per request in lib/scope.ts,
// which re-checks the team belongs to their company.
export async function POST(req: NextRequest) {
  const user = await getCurrentUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isCompanyWide(user.role)) return NextResponse.json({ error: "Only Admin and HR switch teams." }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid team" }, { status: 400 });

  const res = NextResponse.json({ ok: true });
  if (!parsed.data.squadId) {
    res.cookies.delete(SQUAD_COOKIE);
    return res;
  }
  const squad = await prisma.squad.findFirst({ where: { id: parsed.data.squadId, teamId: user.teamId, active: true }, select: { id: true } });
  if (!squad) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  res.cookies.set(SQUAD_COOKIE, squad.id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
}
