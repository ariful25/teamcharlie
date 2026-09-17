import { prisma } from "@/lib/prisma";
import { getSheetsClient } from "./client";

// ---------- Tabs ----------

export const TABS = {
  PROPERTIES: "Properties",
  NEEDS_REVIEW: "Needs Review",
  FAILED_EXTRACTION: "Failed Extraction",
  CHANGE_LOG: "Change Log",
  NOTEBOOK_LM: "NotebookLM",
  // Leading underscore + Google Sheets' own "hide sheet" flag keep this out
  // of a normal user's way — it's Charlie's own bookkeeping, not something
  // anyone is meant to edit directly.
  CONFIG: "_CharlieConfig",
} as const;

// ---------- System column registry (Properties tab) ----------

// The fixed, Charlie-managed columns on the Properties tab, in the exact
// order they're written. `field` is null for the two identity columns
// (airbnbListingId doesn't have its own PropertyKnowledgeItem getter beyond
// the raw field, so this stays a simple string key throughout) used for
// row-matching (see sync.ts) rather than display. Adding a new system
// column later is exactly one entry here — nothing else needs to change.
export const SYSTEM_COLUMNS: { header: string; field: string }[] = [
  { header: "Charlie Property ID", field: "id" },
  { header: "Internal Property Name", field: "internalName" },
  { header: "Airbnb URL", field: "airbnbUrl" },
  { header: "Airbnb Listing ID", field: "airbnbListingId" },
  { header: "Listing Name", field: "listingName" },
  { header: "Description", field: "description" },
  { header: "Property Type", field: "propertyType" },
  { header: "Location", field: "location" },
  { header: "Guest Capacity", field: "guestCapacity" },
  { header: "Bedrooms", field: "bedrooms" },
  { header: "Bathrooms", field: "bathrooms" },
  { header: "Beds", field: "beds" },
  { header: "Amenities", field: "amenities" },
  { header: "Rules", field: "rules" },
  { header: "WiFi Name", field: "wifiName" },
  { header: "WiFi Password", field: "wifiPassword" },
  { header: "Door Code", field: "doorCode" },
  { header: "Parking", field: "parkingInfo" },
  { header: "Check-in Instructions", field: "checkInInfo" },
  { header: "Checkout Instructions", field: "checkoutInfo" },
  { header: "Internal Notes", field: "internalNotes" },
  { header: "Status", field: "status" },
  { header: "Completion %", field: "completionPct" },
  { header: "Last Extracted", field: "extractedAt" },
  { header: "Last Synced", field: "googleSheetSyncedAt" },
];

const SYSTEM_HEADER_SET = new Set(SYSTEM_COLUMNS.map((c) => c.header));

export function isSystemColumn(header: string): boolean {
  return SYSTEM_HEADER_SET.has(header);
}

// ---------- Reading the live header row ----------

// The actual column order in the sheet, including any custom columns an
// admin appended — this is what row-building and range updates key off,
// never the static SYSTEM_COLUMNS order alone, since an admin's custom
// column must keep its position and its data must never be touched.
export async function getPropertiesHeaderRow(spreadsheetId: string): Promise<string[]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${TABS.PROPERTIES}!1:1`,
  });
  return (res.data.values?.[0] ?? []).map((cell) => String(cell ?? "").trim());
}

// ---------- _CharlieConfig registry ----------

type ConfigRow = { column: string; type: "SYSTEM" | "CUSTOM"; sync: "YES" | "NO" };

async function readConfigRows(spreadsheetId: string): Promise<ConfigRow[]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${TABS.CONFIG}!A2:C`,
  });
  return (res.data.values ?? [])
    .filter((row) => row?.[0])
    .map((row) => ({
      column: String(row[0]).trim(),
      type: row[1] === "CUSTOM" ? "CUSTOM" : "SYSTEM",
      sync: row[2] === "NO" ? "NO" : "YES",
    }));
}

async function appendConfigRows(spreadsheetId: string, rows: ConfigRow[]) {
  if (rows.length === 0) return;
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${TABS.CONFIG}!A:C`,
    valueInputOption: "RAW",
    requestBody: { values: rows.map((r) => [r.column, r.type, r.sync]) },
  });
}

// Seeds _CharlieConfig with every SYSTEM_COLUMNS entry — called once, right
// after a client's spreadsheet (and its tabs) are first created.
export async function seedSystemColumnRegistry(spreadsheetId: string) {
  await appendConfigRows(
    spreadsheetId,
    SYSTEM_COLUMNS.map((c) => ({ column: c.header, type: "SYSTEM" as const, sync: "YES" as const }))
  );
}

// Compares the Properties tab's live header row against _CharlieConfig and
// the SYSTEM_COLUMNS list. Any header that isn't already known is a column
// an admin added directly in Sheets — it gets recorded as CUSTOM/NO in
// _CharlieConfig and mirrored into the KnowledgeColumn table, but its data
// and position are never touched. Safe (and cheap) to call before every
// sync — it's how "custom columns survive sync" and "Charlie doesn't
// recreate a deleted custom column" both actually work: a column that was
// deleted from the sheet just won't be in the header row next time, and a
// once-registered column is never re-added on Charlie's own initiative.
export async function registerCustomColumns(clientId: string, spreadsheetId: string): Promise<void> {
  const [headerRow, configRows] = await Promise.all([
    getPropertiesHeaderRow(spreadsheetId),
    readConfigRows(spreadsheetId),
  ]);
  const knownHeaders = new Set([...SYSTEM_HEADER_SET, ...configRows.map((r) => r.column)]);
  const newCustomHeaders = headerRow.filter((header) => header && !knownHeaders.has(header));
  if (newCustomHeaders.length === 0) return;

  await appendConfigRows(
    spreadsheetId,
    newCustomHeaders.map((column) => ({ column, type: "CUSTOM" as const, sync: "NO" as const }))
  );

  await prisma.$transaction(
    newCustomHeaders.map((columnName) =>
      prisma.knowledgeColumn.upsert({
        where: { clientId_columnName: { clientId, columnName } },
        update: {},
        create: { clientId, columnName, columnType: "CUSTOM", source: "ADMIN" },
      })
    )
  );
}
