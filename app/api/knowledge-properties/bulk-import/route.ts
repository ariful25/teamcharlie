import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { propertyKnowledgeBulkImportSchema } from "@/lib/validations";
import { extractAirbnbListingId } from "@/lib/services/airbnb-extractor";

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseRows(csvText: string) {
  const lines = csvText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rows = lines.map((line) => {
    const cells = parseCsvLine(line);
    const urlMatch = line.match(/https?:\/\/(?:www\.)?airbnb\.[^\s,"]+/i);
    if (!urlMatch) {
      return { internalName: cells[0], airbnbUrl: cells[1] };
    }

    const airbnbUrl = urlMatch[0];
    const nameBeforeUrl = line.slice(0, urlMatch.index).replace(/,+$/, "").trim();
    const nameFromCsv = cells.find((cell) => cell !== airbnbUrl && !cell.includes("airbnb."))?.trim();
    const listingId = airbnbUrl.match(/\/rooms\/(\d+)/i)?.[1];
    return {
      internalName: nameBeforeUrl || nameFromCsv || (listingId ? `Airbnb ${listingId}` : "Airbnb listing"),
      airbnbUrl,
    };
  });
  const hasHeader = lines[0] && /property|airbnb/i.test(lines[0]) && !/https?:\/\/(?:www\.)?airbnb\./i.test(lines[0]);
  return (hasHeader ? rows.slice(1) : rows)
    .filter((row) => row.internalName && row.airbnbUrl);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!permissions.canManageKnowledgeBase(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId = (session.user as any).teamId as string;
  const parsed = propertyKnowledgeBulkImportSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const client = await prisma.client.findFirst({ where: { id: parsed.data.clientId, teamId } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const rows = parseRows(parsed.data.csvText);
  if (rows.length === 0) {
    return NextResponse.json({ error: "No valid rows found. Use: Property Name, Airbnb URL" }, { status: 400 });
  }

  let imported = 0;
  let skipped = 0;
  for (const row of rows) {
    let url: URL;
    try {
      url = new URL(row.airbnbUrl);
    } catch {
      skipped++;
      continue;
    }
    const host = url.hostname.replace(/^www\./, "");
    if (host !== "airbnb.com" && !host.endsWith(".airbnb.com")) {
      skipped++;
      continue;
    }

    await prisma.propertyKnowledgeItem.upsert({
      where: { clientId_airbnbUrl: { clientId: client.id, airbnbUrl: url.toString() } },
      update: { internalName: row.internalName, airbnbListingId: extractAirbnbListingId(url.toString()) },
      create: {
        clientId: client.id,
        internalName: row.internalName,
        airbnbUrl: url.toString(),
        airbnbListingId: extractAirbnbListingId(url.toString()),
      },
    });
    imported++;
  }

  if (imported === 0) {
    return NextResponse.json({ error: "No valid Airbnb URLs found. Paste rows like: Property Name, https://www.airbnb.com/rooms/123" }, { status: 400 });
  }

  return NextResponse.json({ imported, skipped });
}
