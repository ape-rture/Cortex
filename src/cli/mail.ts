import "dotenv/config";
import { fileURLToPath } from "node:url";
import type { GmailMessage, GmailMessageHeader } from "../core/types/gmail.js";
import { GMAIL_ACCOUNTS, GoogleGmailClient } from "../integrations/gmail.js";

function usage(): string {
  return [
    "Usage:",
    "  /mail                              — inbox summary",
    "  /mail inbox                        — inbox summary",
    "  /mail search <gmail-query>         — search messages",
    "  /mail read <message-id>            — read a message",
    "  /mail read <account> <message-id>  — read from specific account",
    "  /mail labels [account]             — list labels",
    "  /mail unread                       — unread counts",
    "  /mail archive <account> <id> ...   — archive messages",
    "  /mail trash <account> <id> ...     — trash messages",
    "  /mail done <account> <id> ...      — mark as read",
  ].join("\n");
}

function normalizeAccount(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  const account = GMAIL_ACCOUNTS.find(
    (entry) => entry.id.toLowerCase() === normalized || entry.label?.toLowerCase() === normalized,
  );
  return account?.id;
}

function formatMessageLine(message: GmailMessageHeader): string {
  const date = message.date ? ` | ${message.date}` : "";
  return `- [${message.id}] ${message.subject} (${message.from})${date}`;
}

function isNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return normalized.includes("not found")
    || normalized.includes("requested entity was not found")
    || normalized.includes("404");
}

function formatInboxSummary(summary: {
  totalUnread: number;
  accounts: readonly {
    accountId: string;
    label: string;
    email: string;
    unreadCount: number;
    topUnread: readonly GmailMessageHeader[];
    warning?: string;
  }[];
}): string {
  const lines: string[] = [
    "# Mail Inbox",
    "",
    `Total unread: ${summary.totalUnread}`,
    "",
  ];

  for (const account of summary.accounts) {
    lines.push(`## ${account.label} (${account.email})`);
    if (account.warning) {
      lines.push(`Warning: ${account.warning}`);
      lines.push("");
      continue;
    }

    lines.push(`Unread: ${account.unreadCount}`);
    if (account.topUnread.length === 0) {
      lines.push("(no unread messages)");
      lines.push("");
      continue;
    }

    for (const message of account.topUnread) {
      lines.push(formatMessageLine(message));
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function formatReadMessage(message: GmailMessage): string {
  const lines = [
    `# ${message.subject}`,
    "",
    `ID: ${message.id}`,
    `Account: ${message.accountId}`,
    `From: ${message.from}`,
    `To: ${message.to.join(", ") || "(unknown recipient)"}`,
    `Date: ${message.date || "(unknown date)"}`,
    "",
    "## Body",
    message.body || "(empty body)",
  ];
  return lines.join("\n");
}

async function inbox(): Promise<string> {
  const client = new GoogleGmailClient();
  const summary = await client.fetchMailSummary(5);
  return formatInboxSummary(summary);
}

async function unread(): Promise<string> {
  const client = new GoogleGmailClient();
  const summary = await client.fetchMailSummary(0);
  const lines: string[] = [
    "# Unread Mail Counts",
    "",
    `Total unread: ${summary.totalUnread}`,
    "",
  ];

  for (const account of summary.accounts) {
    lines.push(`- ${account.label} (${account.email}): ${account.unreadCount}`);
    if (account.warning) {
      lines.push(`  warning: ${account.warning}`);
    }
  }

  return lines.join("\n");
}

async function search(query: string): Promise<string> {
  const client = new GoogleGmailClient();
  const lines: string[] = [`# Search: ${query}`, ""];

  for (const account of GMAIL_ACCOUNTS) {
    const result = await client.listMessages(account.id, { query, maxResults: 10 });
    lines.push(`## ${account.label ?? account.id} (${account.email})`);
    if (result.warning) {
      lines.push(`Warning: ${result.warning}`);
      lines.push("");
      continue;
    }
    if (result.messages.length === 0) {
      lines.push("(no matches)");
      lines.push("");
      continue;
    }
    for (const message of result.messages) {
      lines.push(formatMessageLine(message));
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

async function readMessage(args: readonly string[]): Promise<string> {
  const client = new GoogleGmailClient();
  const first = args[0];
  const second = args[1];
  if (!first) return "Usage: mail read <message-id> OR mail read <account> <message-id>";

  const explicitAccountId = normalizeAccount(first);
  if (explicitAccountId && second) {
    const message = await client.getMessage(explicitAccountId, second);
    return formatReadMessage(message);
  }

  const messageId = explicitAccountId ? second : first;
  if (!messageId) return "Usage: mail read <message-id> OR mail read <account> <message-id>";

  const errors: string[] = [];
  for (const account of GMAIL_ACCOUNTS) {
    try {
      const message = await client.getMessage(account.id, messageId);
      return formatReadMessage(message);
    } catch (error) {
      if (isNotFoundError(error)) continue;
      errors.push(`${account.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (errors.length > 0) {
    return `Failed to read ${messageId}:\n${errors.map((entry) => `- ${entry}`).join("\n")}`;
  }
  return `Message not found in configured accounts: ${messageId}`;
}

async function labels(accountArg?: string): Promise<string> {
  const client = new GoogleGmailClient();
  const resolved = normalizeAccount(accountArg);
  const accounts = resolved
    ? GMAIL_ACCOUNTS.filter((account) => account.id === resolved)
    : GMAIL_ACCOUNTS;

  const lines: string[] = ["# Gmail Labels", ""];
  for (const account of accounts) {
    const labelsForAccount = await client.getLabels(account.id);
    lines.push(`## ${account.label ?? account.id} (${account.email})`);
    if (labelsForAccount.length === 0) {
      lines.push("(no labels)");
      lines.push("");
      continue;
    }
    for (const label of labelsForAccount) {
      lines.push(`- ${label.name} (${label.id})`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

function resolveAccountAndIds(args: readonly string[]): { accountId: string; messageIds: string[] } | string {
  const [accountArg, ...ids] = args;
  if (!accountArg || ids.length === 0) {
    return "Usage: /mail <action> <account> <message-id> [message-id ...]";
  }
  const accountId = normalizeAccount(accountArg);
  if (!accountId) {
    return `Unknown account: "${accountArg}". Use one of: ${GMAIL_ACCOUNTS.map((a) => a.id).join(", ")}`;
  }
  return { accountId, messageIds: ids };
}

async function archiveMessages(args: readonly string[]): Promise<string> {
  const resolved = resolveAccountAndIds(args);
  if (typeof resolved === "string") return resolved;
  const client = new GoogleGmailClient();
  await client.archiveMessages(resolved.accountId, resolved.messageIds);
  return `Archived ${resolved.messageIds.length} message(s) from ${resolved.accountId}.`;
}

async function trashMessages(args: readonly string[]): Promise<string> {
  const resolved = resolveAccountAndIds(args);
  if (typeof resolved === "string") return resolved;
  const client = new GoogleGmailClient();
  await client.trashMessages(resolved.accountId, resolved.messageIds);
  return `Trashed ${resolved.messageIds.length} message(s) from ${resolved.accountId}.`;
}

async function markRead(args: readonly string[]): Promise<string> {
  const resolved = resolveAccountAndIds(args);
  if (typeof resolved === "string") return resolved;
  const client = new GoogleGmailClient();
  await client.removeLabel(resolved.accountId, resolved.messageIds, "UNREAD");
  return `Marked ${resolved.messageIds.length} message(s) as read in ${resolved.accountId}.`;
}

export async function runMail(args: readonly string[]): Promise<string> {
  const [command, ...rest] = args;
  if (!command || command === "inbox") {
    return await inbox();
  }

  if (command === "search") {
    const query = rest.join(" ").trim();
    if (!query) return "Usage: mail search <gmail-query>";
    return await search(query);
  }

  if (command === "read") {
    return await readMessage(rest);
  }

  if (command === "labels") {
    return await labels(rest[0]);
  }

  if (command === "unread") {
    return await unread();
  }

  if (command === "archive") {
    return await archiveMessages(rest);
  }

  if (command === "trash") {
    return await trashMessages(rest);
  }

  if (command === "done" || command === "mark-read") {
    return await markRead(rest);
  }

  return usage();
}

async function run(): Promise<void> {
  const output = await runMail(process.argv.slice(2));
  console.log(output);
}

const isMain = fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  run().catch((error) => {
    console.error(`Mail CLI failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

