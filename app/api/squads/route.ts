import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserOrNull } from "@/lib/session";
import { permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { squadNameSchema } from "@/lib/validations";

// A new team inside the company (Alfa, Bravo, ...). Admin only.
export async function POST(req: NextRequest) {
  const user = await getCurrentUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!permissions.canManageSquads(user.role)) return NextResponse.json({ error: "Only an admin creates teams." }, { status: 403 });
  const parsed = z.object({ name: squadNameSchema }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid name" }, { status: 400 });
  const name = parsed.data.name;
  const existing = await prisma.squad.findFirst({ where: { teamId: user.teamId, name: { equals: name, mode: "insensitive" } } });
  if (existing?.active) return NextResponse.json({ error: `There's already a team called ${existing.name}.` }, { status: 409 });
  // Re-creating a closed team brings the old one back, history and all.
  const squad = existing
    ? await prisma.squad.update({ where: { id: existing.id }, data: { active: true } })
    : await prisma.squad.create({ data: { teamId: user.teamId, name } });
  return NextResponse.json({ squad });
}
