// One-time helper to get a Google OAuth2 refresh token for the Google
// Sheets Knowledge Base sync (see lib/google-sheets/client.ts) when using a
// real Google account instead of a service account — the path required for
// a plain Gmail/personal account, since Shared Drives (which a bare
// service account needs) are Google Workspace-only.
//
// Usage:
//   1. In Google Cloud Console: APIs & Services > Credentials > Create
//      Credentials > OAuth client ID > Application type "Desktop app".
//   2. Set GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET in .env from
//      that client.
//   3. Run: npm run google:oauth-setup
//   4. Open the printed URL, log in with the Google account you want to
//      own the client spreadsheets, and grant access.
//   5. This prints a refresh token — paste it into .env as
//      GOOGLE_OAUTH_REFRESH_TOKEN.
import "dotenv/config";
import { createServer } from "node:http";
import { google } from "googleapis";

const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"];

async function main() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in .env first (from a Desktop app OAuth client).");
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // forces a refresh_token even if this account authorized before
    scope: SCOPES,
  });

  console.log("\nOpen this URL in your browser and log in with the Google account you want to use:\n");
  console.log(authUrl);
  console.log("\nWaiting for you to complete sign-in...\n");

  const code: string = await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", REDIRECT_URI);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      res.end(error ? "Authorization failed — you can close this tab." : "Success — you can close this tab and return to the terminal.");
      server.close();
      if (error) reject(new Error(error));
      else if (code) resolve(code);
      else reject(new Error("No code in callback"));
    });
    server.listen(PORT);
  });

  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.refresh_token) {
    console.error(
      "\nNo refresh token returned — this Google account likely already authorized this app before. Go to https://myaccount.google.com/permissions, remove access for this app, and run this script again."
    );
    process.exit(1);
  }

  console.log("\nSuccess. Add this to your .env:\n");
  console.log(`GOOGLE_OAUTH_REFRESH_TOKEN="${tokens.refresh_token}"`);
}

main().catch((err) => {
  console.error("OAuth setup failed:", err.message ?? err);
  process.exit(1);
});
