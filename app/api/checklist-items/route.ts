import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserOrNull } from "@/lib/session";
import { permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checklistItemSchema } from "@/lib/validations";

export async function GET(req: NextRequest) {
  const currentUser = await getCurrentUserOrNull();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const type = req.nextUrl.searchParams.get("type") ?? "CHECKOUT";
  const items = await prisma.checklistItem.findMany({
    where: { teamId: currentUser.teamId, type: type as "CHECKOUT" },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUserOrNull();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!permissions.canManageChecklists(currentUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = checklistItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const last = await prisma.checklistItem.findFirst({
    where: { teamId: currentUser.teamId, type: "CHECKOUT" },
    orderBy: { order: "desc" },
  });

  const item = await prisma.checklistItem.create({
    data: { ...parsed.data, teamId: currentUser.teamId, type: "CHECKOUT", order: (last?.order ?? -1) + 1 },
  });
  return NextResponse.json({ item });
}
