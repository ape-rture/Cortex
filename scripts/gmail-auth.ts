/**
 * Gmail OAuth2 Token Generator
 *
 * Interactive script to generate refresh tokens for Gmail API access.
 * Run once per account:
 *
 *   npx tsx scripts/gmail-auth.ts
 *
 * Prerequisites:
 *   1. Enable Gmail API in Google Cloud Console
 *   2. GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env
 *
 * The script will:
 *   1. Generate an authorization URL
 *   2. Open your browser (or print the URL)
 *   3. Wait for you to paste the authorization code
 *   4. Exchange it for a refresh token
 *   5. Print the refresh token to add to .env
 */

import { google } from "googleapis";
import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { config } from "dotenv";

// Load .env
config();

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.compose",
];

async function main(): Promise<void> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? "http://localhost";

  if (!clientId || !clientSecret) {
    console.error(
      "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env\n" +
        "These are the same credentials used for Google Calendar.",
    );
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri,
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  console.log("\n=== Gmail OAuth2 Token Generator ===\n");
  console.log("Scopes requested:");
  for (const scope of SCOPES) {
    console.log(`  - ${scope}`);
  }
  console.log("\nOpen this URL in your browser and authorize the account:\n");
  console.log(authUrl);
  console.log();

  // Try to open browser automatically (best effort)
  try {
    const { exec } = await import("node:child_process");
    const cmd =
      process.platform === "win32"
        ? `start "" "${authUrl}"`
        : process.platform === "darwin"
          ? `open "${authUrl}"`
          : `xdg-open "${authUrl}"`;
    exec(cmd);
  } catch {
    // Ignore — user can open manually
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });

  console.log(
    "After authorizing, you'll be redirected to a URL like:",
  );
  console.log("  http://localhost?code=4/0A...&scope=...\n");

  const codeInput = await rl.question(
    "Paste the full redirect URL or just the code parameter: ",
  );
  rl.close();

  // Extract code from URL or use raw input
  let code = codeInput.trim();
  try {
    const url = new URL(code);
    const codeParam = url.searchParams.get("code");
    if (codeParam) {
      code = codeParam;
    }
  } catch {
    // Not a URL, treat as raw code
  }

  if (!code) {
    console.error("No authorization code provided.");
    process.exit(1);
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      console.error(
        "\nNo refresh token returned. This can happen if the account was already authorized.\n" +
          "Try revoking access at https://myaccount.google.com/permissions and running again.",
      );
      process.exit(1);
    }

    console.log("\n=== Success! ===\n");
    console.log("Add this to your .env file:\n");
    console.log(`GMAIL_INDEXING_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log("  -- or --");
    console.log(`GMAIL_PERSONAL_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log(
      "\n(Use the appropriate variable name for the account you just authorized.)",
    );

    if (tokens.access_token) {
      // Quick verification
      oauth2Client.setCredentials(tokens);
      const gmail = google.gmail({ version: "v1", auth: oauth2Client });
      const profile = await gmail.users.getProfile({ userId: "me" });
      console.log(`\nVerified: ${profile.data.emailAddress}`);
      console.log(`Messages total: ${profile.data.messagesTotal}`);
      console.log(`Threads total: ${profile.data.threadsTotal}`);
    }
  } catch (err) {
    console.error("\nFailed to exchange code for token:", err);
    process.exit(1);
  }
}

main();
