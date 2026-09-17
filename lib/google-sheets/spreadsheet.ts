import { prisma } from "@/lib/prisma";
import { getSheetsClient, getDriveClient, isGoogleSheetsConfigured, isUsingServiceAccount } from "./client";
import { TABS, SYSTEM_COLUMNS, seedSystemColumnRegistry } from "./columns";
import { syncClientKnowledgeBase } from "./sync";

const NEEDS_REVIEW_HEADERS = ["Property", "Missing Fields", "Completion %", "Status"];
const FAILED_EXTRACTION_HEADERS = ["Property", "Airbnb URL", "Error", "Last Attempt"];
const CHANGE_LOG_HEADERS = ["Timestamp", "Property", "Field", "Old Value", "New Value", "Source"];

function spreadsheetUrlFor(spreadsheetId: string) {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}

// Charlie's Admins can edit/add columns; everyone else (Team Lead,
// Employee) is view-only — see the module 15 spec's permission table.
// Reuses each user's Charlie HQ login email as their Google identity, since
// this team's accounts are on a shared Google Workspace domain; a user
// whose Charlie email isn't a real Google account simply fails that one
// `permissions.create` call, which is caught and skipped individually so
// it never blocks the rest of setup. supportsAllDrives is required because
// the spreadsheet lives inside a Shared Drive (see createClientSpreadsheet).
async function shareWithTeam(spreadsheetId: string, teamId: string) {
  const drive = getDriveClient();
  const users = await prisma.user.findMany({ where: { teamId, active: true }, select: { email: true, role: true } });

  await Promise.allSettled(
    users.map((user) =>
      drive.permissions.create({
        fileId: spreadsheetId,
        supportsAllDrives: true,
        sendNotificationEmail: false,
        requestBody: {
          type: "user",
          role: user.role === "ADMIN" ? "writer" : "reader",
          emailAddress: user.email,
        },
      })
    )
  );
}

// Uses the Drive API directly (rather than sheets.spreadsheets.create,
// which always creates in the caller's own Drive space with no parent)
// so the file can be created straight into GOOGLE_DRIVE_CLIENTS_FOLDER_ID
// when one is configured.
//
// This matters a lot more for a service account: a bare service account
// has 0 bytes of its own storage quota, and creating a file makes it the
// owner (which is what quota is charged against) — so unless the target
// folder lives inside a real Shared Drive (whose storage is pooled at the
// org level, not owned by an individual), creation fails with
// "storageQuotaExceeded" every time, confirmed by testing against this
// project. A real Google account (OAuth2) has normal storage quota, so any
// ordinary folder it can write to works fine, and the folder is optional —
// it just files into that account's Drive root if unset.
async function createSpreadsheetFile(title: string): Promise<string> {
  const folderId = process.env.GOOGLE_DRIVE_CLIENTS_FOLDER_ID;
  if (!folderId && isUsingServiceAccount()) {
    throw new Error(
      "GOOGLE_DRIVE_CLIENTS_FOLDER_ID is not set. With a service account it must point to a folder inside a Shared Drive that the service account is a member of — a bare service account has no storage quota of its own and cannot create files anywhere else."
    );
  }

  const drive = getDriveClient();
  const created = await drive.files.create({
    requestBody: {
      name: title,
      mimeType: "application/vnd.google-apps.spreadsheet",
      ...(folderId ? { parents: [folderId] } : {}),
    },
    supportsAllDrives: true,
    fields: "id",
  });
  const spreadsheetId = created.data.id;
  if (!spreadsheetId) throw new Error("Google did not return a spreadsheet id.");
  return spreadsheetId;
}

// A freshly created spreadsheet has exactly one default tab ("Sheet1")
// which this renames into the first tab (Properties) and adds the
// remaining five alongside it, returning every tab's numeric sheetId
// (needed to hide _CharlieConfig).
async function createTabs(spreadsheetId: string): Promise<Record<string, number>> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  const defaultSheetId = meta.data.sheets?.[0]?.properties?.sheetId;

  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          updateSheetProperties: {
            properties: { sheetId: defaultSheetId, title: TABS.PROPERTIES, gridProperties: { frozenRowCount: 1 } },
            fields: "title,gridProperties.frozenRowCount",
          },
        },
        { addSheet: { properties: { title: TABS.NEEDS_REVIEW, gridProperties: { frozenRowCount: 1 } } } },
        { addSheet: { properties: { title: TABS.FAILED_EXTRACTION, gridProperties: { frozenRowCount: 1 } } } },
        { addSheet: { properties: { title: TABS.CHANGE_LOG, gridProperties: { frozenRowCount: 1 } } } },
        { addSheet: { properties: { title: TABS.NOTEBOOK_LM } } },
        { addSheet: { properties: { title: TABS.CONFIG, gridProperties: { frozenRowCount: 1 } } } },
      ],
    },
  });

  const sheetIds: Record<string, number> = { [TABS.PROPERTIES]: defaultSheetId! };
  for (const reply of res.data.replies ?? []) {
    const props = reply.addSheet?.properties;
    if (props?.title && props.sheetId != null) sheetIds[props.title] = props.sheetId;
  }
  return sheetIds;
}

// Creates the spreadsheet, its six tabs (five visible + hidden
// _CharlieConfig), headers, and Drive sharing, then records it against the
// client. Idempotent: if the client already has a CONNECTED sheet, returns
// it as-is rather than creating a second one — "one spreadsheet per client"
// is also enforced at the DB level by ClientGoogleSheet.clientId being
// @unique, but checking first avoids an orphaned Drive file on a retry.
export async function createClientSpreadsheet(clientId: string) {
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });

  const existing = await prisma.clientGoogleSheet.findUnique({ where: { clientId } });
  if (existing?.status === "CONNECTED" && existing.spreadsheetId) return existing;

  if (!isGoogleSheetsConfigured()) {
    return prisma.clientGoogleSheet.upsert({
      where: { clientId },
      update: { status: "ERROR", lastSyncError: "Google Sheets integration is not configured on this server." },
      create: {
        clientId,
        status: "ERROR",
        lastSyncError: "Google Sheets integration is not configured on this server.",
      },
    });
  }

  await prisma.clientGoogleSheet.upsert({
    where: { clientId },
    update: { status: "CREATING", lastSyncError: null },
    create: { clientId, status: "CREATING" },
  });

  try {
    const sheets = getSheetsClient();
    const spreadsheetId = await createSpreadsheetFile(`${client.name} - Property Knowledge Base`);
    const sheetIds = await createTabs(spreadsheetId);

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: [
          { range: `${TABS.PROPERTIES}!A1`, values: [SYSTEM_COLUMNS.map((c) => c.header)] },
          { range: `${TABS.NEEDS_REVIEW}!A1`, values: [NEEDS_REVIEW_HEADERS] },
          { range: `${TABS.FAILED_EXTRACTION}!A1`, values: [FAILED_EXTRACTION_HEADERS] },
          { range: `${TABS.CHANGE_LOG}!A1`, values: [CHANGE_LOG_HEADERS] },
          { range: `${TABS.CONFIG}!A1`, values: [["Column", "Type", "Sync"]] },
          { range: `${TABS.NOTEBOOK_LM}!A1`, values: [["No properties yet — this fills in automatically once properties are added and synced."]] },
        ],
      },
    });

    if (sheetIds[TABS.CONFIG] != null) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            { updateSheetProperties: { properties: { sheetId: sheetIds[TABS.CONFIG], hidden: true }, fields: "hidden" } },
          ],
        },
      });
    }

    await seedSystemColumnRegistry(spreadsheetId);

    // Sharing with the team is a meaningful convenience but not load-bearing
    // — the spreadsheet (tabs, headers, config) is already fully usable at
    // this point, so one teammate's email failing to resolve on Drive
    // shouldn't discard an otherwise-successful setup. Recorded as a
    // warning instead of failing the whole operation into ERROR.
    let warning: string | null = null;
    try {
      await shareWithTeam(spreadsheetId, client.teamId);
    } catch (err: any) {
      warning = `Could not share with all team members: ${err?.message ?? err}`;
    }

    const record = await prisma.clientGoogleSheet.update({
      where: { clientId },
      data: {
        spreadsheetId,
        spreadsheetUrl: spreadsheetUrlFor(spreadsheetId),
        status: "CONNECTED",
        lastSyncError: warning,
      },
    });

    await prisma.knowledgeSyncLog.create({
      data: {
        clientId,
        action: "SPREADSHEET_CREATED",
        source: "SYSTEM",
        message: `Created "${client.name} - Property Knowledge Base"${warning ? ` (warning: ${warning})` : ""}`,
      },
    });

    // Backfill: a client that already has properties (the common case when
    // creating a sheet for an existing client, as opposed to a brand-new
    // one) should see them appear immediately, not sit on an empty
    // Properties tab until someone happens to click "Sync Now". Best-effort
    // — the sheet is already fully created and CONNECTED at this point, so
    // a backfill hiccup shouldn't undo that; it's retryable via Sync Now.
    try {
      await syncClientKnowledgeBase(clientId);
    } catch (err: any) {
      await prisma.knowledgeSyncLog.create({
        data: { clientId, action: "SYNC_ERROR", source: "SYSTEM", message: `Initial backfill sync failed: ${err?.message ?? err}` },
      });
    }

    return record;
  } catch (err: any) {
    const message = err?.message ?? "Could not create the Google Spreadsheet.";
    await prisma.clientGoogleSheet.update({
      where: { clientId },
      data: { status: "ERROR", lastSyncError: message },
    });
    await prisma.knowledgeSyncLog.create({
      data: { clientId, action: "SYNC_ERROR", source: "SYSTEM", message },
    });
    throw err;
  }
}
