import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { propertyKnowledgeItemsToCsv } from "@/lib/services/property-knowledge-export";
import { sendKnowledgeExportNotification } from "@/lib/discord";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // The CSV includes operational fields like wifi passwords and door codes —
  // exporting it is a bulk sensitive-data action and must be gated the same
  // way create/edit/extract already are, not left reachable by any team
  // member just because the download link exists.
  const role = (session.user as any).role;
  if (!permissions.canManageKnowledgeBase(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = (session.user as any).teamId as string;
  const clientId = req.nextUrl.searchParams.get("clientId") ?? undefined;
  const where = { client: { teamId }, ...(clientId ? { clientId } : {}) };

  const items = await prisma.propertyKnowledgeItem.findMany({
    where,
    include: { client: true },
    orderBy: [{ client: { name: "asc" } }, { internalName: "asc" }],
  });

  // Downloading a CSV is a read — it must never change a property's
  // workflow status (see property-knowledge.ts's MANUAL_KNOWLEDGE_STATUSES
  // for why PENDING/NEEDS_REVIEW/FAILED must stay meaningful). exportedAt is
  // purely informational ("last downloaded at") and intentionally does not
  // touch `status`.
  if (items.length > 0) {
    await prisma.propertyKnowledgeItem.updateMany({
      where: { id: { in: items.map((item) => item.id) } },
      data: { exportedAt: new Date() },
    });
  }

  // Best-effort visibility into who exported sensitive operational data and
  // when — never blocks or fails the download itself if Discord isn't
  // configured or is unreachable.
  const client = clientId ? items[0]?.client ?? (await prisma.client.findUnique({ where: { id: clientId } })) : null;
  await sendKnowledgeExportNotification({
    actorName: session.user.name ?? "Unknown user",
    teamName: (session.user as any).teamSlug ? String((session.user as any).teamSlug).replace(/^\w/, (c: string) => c.toUpperCase()) : "Charlie",
    clientName: client?.name ?? null,
    itemCount: items.length,
  }).catch(() => {});

  const csv = propertyKnowledgeItemsToCsv(items);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="property-knowledge-base.csv"`,
    },
  });
}
