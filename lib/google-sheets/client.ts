import { google } from "googleapis";

// Server-only. Every function here (and everything in the rest of
// lib/google-sheets/) must only ever be called from API routes/server
// components — never imported into a "use client" file. Credentials are
// read from environment variables and never leave the server; nothing in
// components/ ever sees them.
//
// Two supported auth methods (see .env.example) — pick whichever fits your
// Google account:
//
// 1. OAuth2 as a real Google account (GOOGLE_OAUTH_CLIENT_ID/SECRET/
//    REFRESH_TOKEN). Required for a plain Gmail/personal Google account: a
//    real user has normal Drive storage quota, so files it creates just
//    count against that account's own quota — no Shared Drive needed.
//    GOOGLE_DRIVE_CLIENTS_FOLDER_ID can be any ordinary folder that
//    account already owns or can write to.
//
// 2. A service account (GOOGLE_SERVICE_ACCOUNT_EMAIL/PRIVATE_KEY). Only
//    works if GOOGLE_DRIVE_CLIENTS_FOLDER_ID is a folder inside a real
//    Shared Drive with the service account added as a member — a bare
//    service account has 0 bytes of its own storage quota, so creating a
//    file anywhere else fails with "storageQuotaExceeded" (confirmed by
//    testing). This path needs a Google Workspace plan with Shared Drives.
//
// If both are configured, OAuth2 takes precedence.

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"];

export function hasOAuthCredentials(): boolean {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET && process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  );
}

export function hasServiceAccountCredentials(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
}

export class GoogleSheetsNotConfiguredError extends Error {
  constructor() {
    super("Google Sheets integration is not configured (no OAuth2 or service account credentials found).");
    this.name = "GoogleSheetsNotConfiguredError";
  }
}

export function isGoogleSheetsConfigured(): boolean {
  return hasOAuthCredentials() || hasServiceAccountCredentials();
}

// True when running as a bare service account — used by spreadsheet.ts to
// decide whether the Shared Drive requirement/error message applies.
export function isUsingServiceAccount(): boolean {
  return !hasOAuthCredentials() && hasServiceAccountCredentials();
}

let authClient: InstanceType<typeof google.auth.JWT> | InstanceType<typeof google.auth.OAuth2> | null = null;

function getAuth() {
  if (authClient) return authClient;

  if (hasOAuthCredentials()) {
    const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET);
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
    authClient = oauth2Client;
    return authClient;
  }

  if (hasServiceAccountCredentials()) {
    authClient = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      // .env values commonly store the PEM key with literal "\n" sequences
      // instead of real newlines (multi-line values don't survive most .env
      // loaders otherwise) — this restores them.
      key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      scopes: SCOPES,
    });
    return authClient;
  }

  throw new GoogleSheetsNotConfiguredError();
}

export function getSheetsClient() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

export function getDriveClient() {
  return google.drive({ version: "v3", auth: getAuth() });
}
