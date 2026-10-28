import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserOrNull } from "@/lib/session";
import { permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { squadNameSchema } from "@/lib/validations";

const schema = z.object({ name: squadNameSchema.optional(), active: z.boolean().optional() });

// Rename a team, or close it. Closing is refused while anyone or any client
// is still in it, so nothing silently ends up without a team.
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!permissions.canManageSquads(user.role)) return NextResponse.json({ error: "Only an admin changes teams." }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  const squad = await prisma.squad.findFirst({ where: { id: params.id, teamId: user.teamId } });
  if (!squad) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const data: { name?: string; active?: boolean } = {};
  if (parsed.data.name) {
    const name = parsed.data.name;
    const clash = await prisma.squad.findFirst({ where: { teamId: user.teamId, id: { not: squad.id }, name: { equals: name, mode: "insensitive" } } });
    if (clash) return NextResponse.json({ error: `There's already a team called ${clash.name}.` }, { status: 409 });
    data.name = name;
  }
  if (parsed.data.active === false) {
    const [people, clients] = await Promise.all([
      prisma.user.count({ where: { squadId: squad.id, active: true } }),
      prisma.client.count({ where: { squadId: squad.id, active: true } }),
    ]);
    if (people || clients) {
      return NextResponse.json(
        { error: `Move its ${[people && `${people} ${people === 1 ? "person" : "people"}`, clients && `${clients} ${clients === 1 ? "client" : "clients"}`].filter(Boolean).join(" and ")} to another team first.` },
        { status: 409 }
      );
    }
    data.active = false;
  } else if (parsed.data.active === true) data.active = true;

  const updated = await prisma.squad.update({ where: { id: squad.id }, data });
  return NextResponse.json({ squad: updated });
}
