import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePortalManager } from "@/lib/portal/staff";

// Turn an owner's portal login off or back on. Off takes effect on their
// next click (lib/portal/session.ts re-reads it every request).
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId } = await props.params;
  const auth = await requirePortalManager(id);
  if ("error" in auth) return auth.error;
  const parsed = z.object({ active: z.boolean() }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const r = await prisma.clientUser.updateMany({ where: { id: userId, clientId: id }, data: { active: parsed.data.active } });
  if (!r.count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
