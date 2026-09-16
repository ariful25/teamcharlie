import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import Papa from "papaparse";
import { authOptions, permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { propertyKnowledgeBulkImportSchema } from "@/lib/validations";
import { normalizeAirbnbUrl } from "@/lib/services/property-knowledge";

// A loose pre-filter to pick out which cell in a row is the Airbnb URL
// column before running it through the strict, centralized
// normalizeAirbnbUrl validator (which also rejects lookalike domains).
const LOOSE_AIRBNB_CELL = /airbnb\.[a-z.]{2,24}\//i;

type ParsedRow = { internalName: string; airbnbUrl: string };

// Uses a real CSV parser (papaparse) instead of hand-rolled line splitting,
// so quoted property names containing commas, quotes, or extra whitespace
// survive intact — the previous regex-based approach corrupted exactly
// those cases (see issue 5 in the audit).
function rowsFromCsv(csvText: string): ParsedRow[] {
  const result = Papa.parse<string[]>(csvText.trim(), { skipEmptyLines: true });
  const rows = (result.data ?? []).filter((cells) => cells.some((cell) => cell.trim() !== ""));
  if (rows.length === 0) return [];

  const [firstRow] = rows;
  const looksLikeHeader =
    firstRow.some((cell) => /property|internal|airbnb|url|name/i.test(cell)) &&
    !firstRow.some((cell) => LOOSE_AIRBNB_CELL.test(cell));
  const dataRows = looksLikeHeader ? rows.slice(1) : rows;

  // Some people paste the name and URL as two separate lines (e.g. copying
  // from a doc where each wraps onto its own line) rather than "Name, URL"
  // on one line. A name-only row has no URL cell at all, and the URL-only
  // row that follows has no name cell — treated independently, the name row
  // would be silently dropped (no valid URL) and the URL row would fall
  // back to "Airbnb <id>". Carrying the most recent name-only line forward
  // as `pendingName` until the next row with a URL consumes it fixes that,
  // without changing anything about the normal single-line format (a row
  // that already has both simply uses its own name and never touches
  // `pendingName`).
  const parsedRows: ParsedRow[] = [];
  let pendingName: string | null = null;

  for (const cells of dataRows) {
    const trimmed = cells.map((cell) => cell.trim());
    const airbnbUrl = trimmed.find((cell) => LOOSE_AIRBNB_CELL.test(cell)) ?? "";
    const rawName = trimmed.find((cell) => cell && cell !== airbnbUrl) ?? "";

    if (!airbnbUrl) {
      if (rawName) pendingName = rawName;
      continue;
    }

    const nameForRow = rawName || pendingName || "";
    pendingName = null;
    // Hosts commonly label a unit as "Property Name: Room/Unit" (e.g. "The
    // Wake House: Kayaks") — only the part before the colon is the property's
    // internal name, so that's what gets stored, not the full label.
    const internalName = nameForRow.split(":")[0].trim();
    parsedRows.push({ internalName, airbnbUrl });
  }

  return parsedRows;
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

  const rows = rowsFromCsv(parsed.data.csvText);
  if (rows.length === 0) {
    return NextResponse.json({ error: "No valid rows found. Use: Internal Property Name, Airbnb URL" }, { status: 400 });
  }

  let imported = 0;
  let updated = 0;
  let skippedDuplicates = 0;
  let invalidRows = 0;
  const seenInBatch = new Set<string>();

  // Every URL variant of the same listing normalizes to one canonical URL
  // (see property-knowledge.ts), so this lookup — and the upsert below —
  // key on listing identity rather than the raw pasted string.
  const normalizedRows = rows.map((row) => ({
    row,
    normalized: row.airbnbUrl ? normalizeAirbnbUrl(row.airbnbUrl) : null,
  }));
  const candidateUrls = normalizedRows
    .map((r) => r.normalized?.url)
    .filter((url): url is string => Boolean(url));
  const existing = candidateUrls.length
    ? await prisma.propertyKnowledgeItem.findMany({
        where: { clientId: client.id, airbnbUrl: { in: candidateUrls } },
        select: { airbnbUrl: true },
      })
    : [];
  const existingUrls = new Set(existing.map((item) => item.airbnbUrl));

  for (const { row, normalized } of normalizedRows) {
    if (!normalized) {
      invalidRows++;
      continue;
    }

    const internalName = row.internalName || (normalized.listingId ? `Airbnb ${normalized.listingId}` : "");
    if (!internalName) {
      invalidRows++;
      continue;
    }

    if (seenInBatch.has(normalized.url)) {
      skippedDuplicates++;
      continue;
    }
    seenInBatch.add(normalized.url);

    await prisma.propertyKnowledgeItem.upsert({
      where: { clientId_airbnbUrl: { clientId: client.id, airbnbUrl: normalized.url } },
      update: { internalName, airbnbListingId: normalized.listingId },
      create: {
        clientId: client.id,
        internalName,
        airbnbUrl: normalized.url,
        airbnbListingId: normalized.listingId,
      },
    });

    if (existingUrls.has(normalized.url)) {
      updated++;
    } else {
      imported++;
    }
  }

  if (imported === 0 && updated === 0) {
    return NextResponse.json(
      { error: "No valid Airbnb URLs found. Paste rows like: Property Name, https://www.airbnb.com/rooms/123" },
      { status: 400 }
    );
  }

  return NextResponse.json({ imported, updated, skippedDuplicates, invalidRows });
}
