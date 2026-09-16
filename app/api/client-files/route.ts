import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clientFileSchema } from "@/lib/validations";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamId = (session.user as any).teamId as string;
  const clientId = req.nextUrl.searchParams.get("clientId") ?? undefined;
  const category = req.nextUrl.searchParams.get("category") ?? undefined;

  const files = await prisma.clientFile.findMany({
    where: {
      client: { teamId },
      ...(clientId ? { clientId } : {}),
      ...(category ? { category: category as any } : {}),
    },
    orderBy: [{ category: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ files });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!permissions.canManageClientFiles(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = (session.user as any).teamId as string;
  const parsed = clientFileSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const client = await prisma.client.findFirst({ where: { id: parsed.data.clientId, teamId } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const file = await prisma.clientFile.create({
    data: { ...parsed.data, createdById: (session.user as any).id ?? null },
  });
  return NextResponse.json({ file });
}
