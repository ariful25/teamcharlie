import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { propertyKnowledgeItemsToCsv } from "@/lib/services/property-knowledge-export";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamId = (session.user as any).teamId as string;
  const clientId = req.nextUrl.searchParams.get("clientId") ?? undefined;
  const where = { client: { teamId }, ...(clientId ? { clientId } : {}) };

  const items = await prisma.propertyKnowledgeItem.findMany({
    where,
    include: { client: true },
    orderBy: [{ client: { name: "asc" } }, { internalName: "asc" }],
  });

  await prisma.propertyKnowledgeItem.updateMany({
    where,
    data: { status: "EXPORTED", exportedAt: new Date() },
  });

  const csv = propertyKnowledgeItemsToCsv(items);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="property-knowledge-base.csv"`,
    },
  });
}
