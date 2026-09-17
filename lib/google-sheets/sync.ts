import { prisma } from "@/lib/prisma";
import { getSheetsClient } from "./client";
import { TABS, SYSTEM_COLUMNS, getPropertiesHeaderRow, registerCustomColumns } from "./columns";
import { REQUIRED_KNOWLEDGE_FIELDS, isFieldFilled } from "@/lib/services/property-knowledge";

// ---------- helpers ----------

function columnLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function formatCellValue(field: string, property: Record<string, unknown>, syncedAt: Date): string {
  if (field === "googleSheetSyncedAt") return syncedAt.toISOString();
  const value = property[field];
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

type SheetRow = { rowNumber: number; values: string[] };

async function findExistingRow(
  spreadsheetId: string,
  headerRow: string[],
  property: { id: string; airbnbListingId: string | null }
): Promise<SheetRow | null> {
  const sheets = getSheetsClient();
  const lastCol = columnLetter(Math.max(headerRow.length - 1, 0));
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${TABS.PROPERTIES}!A2:${lastCol}`,
  });
  const rows = res.data.values ?? [];
  const idCol = headerRow.indexOf("Charlie Property ID");
  const listingIdCol = headerRow.indexOf("Airbnb Listing ID");

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // Primary match: Charlie Property ID. Fallback: Airbnb Listing ID.
    // Property Name is never used to match — see spec's sync-matching rule;
    // names change, ids don't.
    if (idCol >= 0 && row[idCol] === property.id) return { rowNumber: i + 2, values: row };
    if (
      listingIdCol >= 0 &&
      property.airbnbListingId &&
      row[listingIdCol] &&
      row[listingIdCol] === property.airbnbListingId
    ) {
      return { rowNumber: i + 2, values: row };
    }
  }
  return null;
}

async function appendChangeLog(
  clientId: string,
  entries: { propertyId: string; field: string; oldValue: string; newValue: string; source: string }[]
) {
  if (entries.length === 0) return;
  const property = await prisma.propertyKnowledgeItem.findUnique({ where: { id: entries[0].propertyId }, select: { internalName: true, clientId: true } });
  const sheet = await prisma.clientGoogleSheet.findUnique({ where: { clientId } });

  await prisma.knowledgeSyncLog.createMany({
    data: entries.map((e) => ({
      clientId,
      propertyId: e.propertyId,
      action: "FIELD_UPDATED",
      field: e.field,
      oldValue: e.oldValue,
      newValue: e.newValue,
      source: e.source,
    })),
  });

  if (sheet?.spreadsheetId) {
    const sheets = getSheetsClient();
    const timestamp = new Date().toISOString();
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheet.spreadsheetId,
      range: `${TABS.CHANGE_LOG}!A:F`,
      valueInputOption: "RAW",
      requestBody: {
        values: entries.map((e) => [timestamp, property?.internalName ?? entries[0].propertyId, e.field, e.oldValue, e.newValue, e.source]),
      },
    });
  }
}

// ---------- property row sync ----------

// Writes (or creates) exactly one property's row on the Properties tab.
// Only SYSTEM_COLUMNS cells are ever computed/written; whatever sits in any
// other column position — a custom column an admin added — is read back
// and written right back unchanged, never left blank and never dropped.
export async function syncPropertyToSheet(propertyId: string, source: string = "SYSTEM"): Promise<void> {
  const property = await prisma.propertyKnowledgeItem.findUnique({
    where: { id: propertyId },
    include: { client: { include: { googleSheet: true } } },
  });
  if (!property) return;

  const sheetRecord = property.client.googleSheet;
  if (!sheetRecord || sheetRecord.status !== "CONNECTED" || !sheetRecord.spreadsheetId) return;

  const spreadsheetId = sheetRecord.spreadsheetId;
  const clientId = property.clientId;

  await registerCustomColumns(clientId, spreadsheetId);
  const headerRow = await getPropertiesHeaderRow(spreadsheetId);
  const existing = await findExistingRow(spreadsheetId, headerRow, property);
  const syncedAt = new Date();

  const propertyRecord = property as unknown as Record<string, unknown>;
  const changeLogEntries: { propertyId: string; field: string; oldValue: string; newValue: string; source: string }[] = [];

  const newValues = headerRow.map((header, index) => {
    const systemColumn = SYSTEM_COLUMNS.find((c) => c.header === header);
    if (!systemColumn) {
      // Custom column: keep whatever was already there (blank for a
      // brand-new row — there's nothing to preserve yet).
      return existing?.values?.[index] ?? "";
    }
    const newValue = formatCellValue(systemColumn.field, propertyRecord, syncedAt);
    if (existing && systemColumn.field !== "googleSheetSyncedAt") {
      const oldValue = existing.values[index] ?? "";
      if (oldValue !== newValue) {
        changeLogEntries.push({ propertyId, field: systemColumn.header, oldValue, newValue, source });
      }
    }
    return newValue;
  });

  const sheets = getSheetsClient();
  const lastCol = columnLetter(Math.max(headerRow.length - 1, 0));

  if (existing) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${TABS.PROPERTIES}!A${existing.rowNumber}:${lastCol}${existing.rowNumber}`,
      valueInputOption: "RAW",
      requestBody: { values: [newValues] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${TABS.PROPERTIES}!A:${lastCol}`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [newValues] },
    });
    await prisma.knowledgeSyncLog.create({
      data: { clientId, propertyId, action: "PROPERTY_ADDED", source, message: property.internalName },
    });
  }

  await appendChangeLog(clientId, changeLogEntries);

  await Promise.all([
    prisma.propertyKnowledgeItem.update({ where: { id: propertyId }, data: { googleSheetSyncedAt: syncedAt } }),
    prisma.clientGoogleSheet.update({ where: { clientId }, data: { lastSyncedAt: syncedAt, lastSyncError: null } }),
  ]);

  await refreshDerivedTabs(clientId);
}

// ---------- derived tabs (fully recomputed from the DB every time) ----------

async function refreshNeedsReview(spreadsheetId: string, clientId: string) {
  const items = await prisma.propertyKnowledgeItem.findMany({
    where: { clientId, status: { in: ["PENDING", "NEEDS_REVIEW"] } },
    orderBy: { internalName: "asc" },
  });
  const rows = items.map((item) => {
    const missing = REQUIRED_KNOWLEDGE_FIELDS.filter((field) => !isFieldFilled((item as any)[field]));
    return [item.internalName, missing.join(", "), `${item.completionPct}%`, item.status];
  });

  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${TABS.NEEDS_REVIEW}!A2:D` });
  if (rows.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${TABS.NEEDS_REVIEW}!A2`,
      valueInputOption: "RAW",
      requestBody: { values: rows },
    });
  }
}

async function refreshFailedExtraction(spreadsheetId: string, clientId: string) {
  const items = await prisma.propertyKnowledgeItem.findMany({
    where: { clientId, status: "FAILED" },
    orderBy: { updatedAt: "desc" },
  });
  const rows = items.map((item) => [
    item.internalName,
    item.airbnbUrl,
    item.extractionError ?? "",
    item.updatedAt.toISOString(),
  ]);

  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${TABS.FAILED_EXTRACTION}!A2:D` });
  if (rows.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${TABS.FAILED_EXTRACTION}!A2`,
      valueInputOption: "RAW",
      requestBody: { values: rows },
    });
  }
}

// Builds the human-readable, NotebookLM-optimized block for one property —
// technical/internal fields (ids, wifi password, door code, status,
// completion %) are deliberately left out; this tab is meant to be read,
// not audited.
function notebookLmBlockFor(item: Record<string, any>): string[] {
  const lines: string[] = [];
  const title = item.listingName || item.internalName;
  lines.push("=".repeat(Math.max(title.length, 9)));
  lines.push(String(title).toUpperCase());
  lines.push("=".repeat(Math.max(title.length, 9)));
  lines.push("");

  const field = (label: string, value: unknown) => {
    if (!isFieldFilled(value)) return;
    lines.push(`${label}:`);
    lines.push(Array.isArray(value) ? value.join(", ") : String(value));
    lines.push("");
  };

  field("Location", item.location);
  field("Guests", item.guestCapacity);
  field("Bedrooms", item.bedrooms);
  field("Bathrooms", item.bathrooms);
  field("Beds", item.beds);
  field("Description", item.description);
  field("Amenities", item.amenities);
  field("Rules", item.rules);
  field("Check-in", item.checkInInfo);
  field("Checkout", item.checkoutInfo);

  return lines;
}

async function refreshNotebookLm(spreadsheetId: string, clientId: string) {
  const items = await prisma.propertyKnowledgeItem.findMany({ where: { clientId }, orderBy: { internalName: "asc" } });
  const lines = items.length
    ? items.flatMap((item) => notebookLmBlockFor(item as any))
    : ["No properties yet — this fills in automatically once properties are added and synced."];

  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${TABS.NOTEBOOK_LM}!A1:A` });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${TABS.NOTEBOOK_LM}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: lines.map((line) => [line]) },
  });
}

// Rebuilds Needs Review, Failed Extraction, and the NotebookLM view from
// current DB state. These three tabs are entirely Charlie-computed (no
// custom columns are expected or preserved on them), so a full rebuild
// every time is simpler and safer than an incremental diff.
export async function refreshDerivedTabs(clientId: string): Promise<void> {
  const sheet = await prisma.clientGoogleSheet.findUnique({ where: { clientId } });
  if (!sheet || sheet.status !== "CONNECTED" || !sheet.spreadsheetId) return;
  const spreadsheetId = sheet.spreadsheetId;
  await Promise.all([
    refreshNeedsReview(spreadsheetId, clientId),
    refreshFailedExtraction(spreadsheetId, clientId),
    refreshNotebookLm(spreadsheetId, clientId),
  ]);
}

export { refreshNotebookLm as createNotebookLMView };

// Full resync of every property a client has — used by the "Sync Now"
// button, and safe to run any time (e.g. after connecting a spreadsheet for
// a client that already had properties).
export async function syncClientKnowledgeBase(clientId: string): Promise<{ synced: number; errors: number }> {
  const sheet = await prisma.clientGoogleSheet.findUnique({ where: { clientId } });
  if (!sheet || sheet.status !== "CONNECTED" || !sheet.spreadsheetId) {
    throw new Error("This client doesn't have a connected Google Sheet yet.");
  }

  const items = await prisma.propertyKnowledgeItem.findMany({ where: { clientId }, select: { id: true } });
  let synced = 0;
  let errors = 0;
  for (const item of items) {
    try {
      await syncPropertyToSheet(item.id, "MANUAL_SYNC");
      synced++;
    } catch (err: any) {
      errors++;
      await prisma.knowledgeSyncLog.create({
        data: { clientId, propertyId: item.id, action: "SYNC_ERROR", source: "MANUAL_SYNC", message: err?.message ?? "Sync failed" },
      });
    }
  }
  await refreshDerivedTabs(clientId);
  return { synced, errors };
}
