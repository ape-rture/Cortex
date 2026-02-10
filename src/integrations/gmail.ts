import { google, type gmail_v1 } from "googleapis";
import type {
  GmailAccountConfig,
  GmailAccountSummary,
  GmailClient,
  GmailFetchResult,
  GmailLabel,
  GmailMailSummary,
  GmailMessage,
  GmailMessageHeader,
  GmailSearchOptions,
} from "../core/types/gmail.js";

export const GMAIL_ACCOUNTS: readonly GmailAccountConfig[] = [
  {
    id: "indexing",
    email: "dennis@indexing.co",
    refreshTokenEnvVar: "GMAIL_INDEXING_REFRESH_TOKEN",
    label: "Indexing",
  },
  {
    id: "personal",
    email: "dennisverstappen1@gmail.com",
    refreshTokenEnvVar: "GMAIL_PERSONAL_REFRESH_TOKEN",
    label: "Personal",
  },
];

type GoogleApiLike = Pick<typeof google, "auth" | "gmail">;

type GmailClientDeps = {
  readonly googleApi?: GoogleApiLike;
  readonly env?: NodeJS.ProcessEnv;
};

type AccountClient = {
  readonly account: GmailAccountConfig;
  readonly service?: gmail_v1.Gmail;
  readonly warning?: string;
};

type BodyParts = {
  readonly plain: string[];
  readonly html: string[];
};

const DEFAULT_REDIRECT_URI = "http://localhost";
const HEADER_KEYS = ["From", "To", "Subject", "Date"] as const;

function getEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function sanitizeHeaderValue(value: string): string {
  return value.replace(/\r?\n/g, " ").trim();
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string | null | undefined): string {
  if (!value) return "";
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function toHeaderMap(
  headers: readonly gmail_v1.Schema$MessagePartHeader[] | null | undefined,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const header of headers ?? []) {
    const name = header.name?.trim().toLowerCase();
    if (!name) continue;
    map[name] = header.value?.trim() ?? "";
  }
  return map;
}

function parseRecipients(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function hasAttachment(part: gmail_v1.Schema$MessagePart | null | undefined): boolean {
  if (!part) return false;
  if ((part.filename?.trim().length ?? 0) > 0) return true;
  for (const child of part.parts ?? []) {
    if (hasAttachment(child)) return true;
  }
  return false;
}

function collectBodyParts(
  part: gmail_v1.Schema$MessagePart | null | undefined,
  destination: BodyParts,
): void {
  if (!part) return;

  const mimeType = part.mimeType?.toLowerCase() ?? "";
  const bodyData = decodeBase64Url(part.body?.data);
  if (mimeType.startsWith("text/plain") && bodyData) {
    destination.plain.push(bodyData);
  } else if (mimeType.startsWith("text/html") && bodyData) {
    destination.html.push(bodyData);
  } else if (!mimeType && bodyData) {
    destination.plain.push(bodyData);
  }

  for (const child of part.parts ?? []) {
    collectBodyParts(child, destination);
  }
}

function extractBodies(
  payload: gmail_v1.Schema$MessagePart | null | undefined,
  fallbackSnippet: string,
): { body: string; htmlBody?: string } {
  const bucket: BodyParts = { plain: [], html: [] };
  collectBodyParts(payload, bucket);

  const plain = bucket.plain.join("\n\n").trim();
  const html = bucket.html.join("\n\n").trim();
  return {
    body: plain || fallbackSnippet || "",
    htmlBody: html || undefined,
  };
}

function messageToHeader(accountId: string, message: gmail_v1.Schema$Message): GmailMessageHeader {
  const headerMap = toHeaderMap(message.payload?.headers);
  const labelIds = message.labelIds ?? [];
  return {
    id: message.id ?? "",
    threadId: message.threadId ?? "",
    accountId,
    from: headerMap.from ?? "(unknown sender)",
    to: parseRecipients(headerMap.to),
    subject: headerMap.subject ?? "(no subject)",
    date: headerMap.date ?? "",
    snippet: message.snippet ?? "",
    labelIds,
    isUnread: labelIds.includes("UNREAD"),
    hasAttachments: hasAttachment(message.payload),
  };
}

function messageToFull(accountId: string, message: gmail_v1.Schema$Message): GmailMessage {
  const header = messageToHeader(accountId, message);
  const extracted = extractBodies(message.payload, header.snippet);
  return {
    ...header,
    body: extracted.body,
    htmlBody: extracted.htmlBody,
    headers: toHeaderMap(message.payload?.headers),
  };
}

function buildQuery(options?: GmailSearchOptions): string | undefined {
  const parts: string[] = [];
  const query = options?.query?.trim();
  if (query) parts.push(query);
  const after = options?.after?.trim();
  if (after) parts.push(`after:${after}`);
  const before = options?.before?.trim();
  if (before) parts.push(`before:${before}`);
  if (parts.length === 0) return undefined;
  return parts.join(" ");
}

async function resolveMessageDetails(
  service: gmail_v1.Gmail,
  messageIds: readonly string[],
  includeBody: boolean,
): Promise<gmail_v1.Schema$Message[]> {
  const format: "full" | "metadata" = includeBody ? "full" : "metadata";
  const details = await Promise.all(
    messageIds.map(async (messageId) => {
      const response = await service.users.messages.get({
        userId: "me",
        id: messageId,
        format,
        metadataHeaders: includeBody ? undefined : [...HEADER_KEYS],
      });
      return response.data;
    }),
  );
  return details.filter((message) => Boolean(message.id));
}

export class GoogleGmailClient implements GmailClient {
  private readonly googleApi: GoogleApiLike;

  private readonly env: NodeJS.ProcessEnv;

  private readonly clients = new Map<string, AccountClient>();

  public constructor(deps: GmailClientDeps = {}) {
    this.googleApi = deps.googleApi ?? google;
    this.env = deps.env ?? process.env;
  }

  public async listMessages(
    accountId: string,
    options: GmailSearchOptions = {},
  ): Promise<GmailFetchResult> {
    const client = this.resolveAccountClient(accountId);
    if (!client.service) {
      return {
        account: accountId,
        messages: [],
        warning: client.warning,
        resultSizeEstimate: 0,
      };
    }

    const response = await client.service.users.messages.list({
      userId: "me",
      q: buildQuery(options),
      maxResults: options.maxResults ?? 10,
      labelIds: options.labelIds ? [...options.labelIds] : undefined,
    });

    const messageIds = (response.data.messages ?? [])
      .map((message) => message.id)
      .filter((id): id is string => Boolean(id));

    const details = await resolveMessageDetails(client.service, messageIds, options.includeBody ?? false);
    const messages = details.map((message) => messageToHeader(accountId, message));
    return {
      account: accountId,
      messages,
      resultSizeEstimate: response.data.resultSizeEstimate ?? undefined,
    };
  }

  public async getMessage(accountId: string, messageId: string): Promise<GmailMessage> {
    const client = this.requireAccountClient(accountId);
    const response = await client.service.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    });
    return messageToFull(accountId, response.data);
  }

  public async getUnreadCount(accountId: string): Promise<number> {
    const client = this.resolveAccountClient(accountId);
    if (!client.service) return 0;
    const response = await client.service.users.messages.list({
      userId: "me",
      q: "is:unread",
      maxResults: 1,
    });
    return response.data.resultSizeEstimate ?? 0;
  }

  public async archiveMessages(
    accountId: string,
    messageIds: readonly string[],
  ): Promise<void> {
    const client = this.requireAccountClient(accountId);
    await Promise.all(
      messageIds.map(async (messageId) => {
        await client.service.users.messages.modify({
          userId: "me",
          id: messageId,
          requestBody: {
            removeLabelIds: ["INBOX"],
          },
        });
      }),
    );
  }

  public async trashMessages(
    accountId: string,
    messageIds: readonly string[],
  ): Promise<void> {
    const client = this.requireAccountClient(accountId);
    await Promise.all(
      messageIds.map(async (messageId) => {
        await client.service.users.messages.trash({
          userId: "me",
          id: messageId,
        });
      }),
    );
  }

  public async addLabel(
    accountId: string,
    messageIds: readonly string[],
    labelId: string,
  ): Promise<void> {
    const client = this.requireAccountClient(accountId);
    await Promise.all(
      messageIds.map(async (messageId) => {
        await client.service.users.messages.modify({
          userId: "me",
          id: messageId,
          requestBody: {
            addLabelIds: [labelId],
          },
        });
      }),
    );
  }

  public async removeLabel(
    accountId: string,
    messageIds: readonly string[],
    labelId: string,
  ): Promise<void> {
    const client = this.requireAccountClient(accountId);
    await Promise.all(
      messageIds.map(async (messageId) => {
        await client.service.users.messages.modify({
          userId: "me",
          id: messageId,
          requestBody: {
            removeLabelIds: [labelId],
          },
        });
      }),
    );
  }

  public async createDraft(
    accountId: string,
    to: string,
    subject: string,
    body: string,
    threadId?: string,
  ): Promise<string> {
    const client = this.requireAccountClient(accountId);
    const lines = [
      `To: ${sanitizeHeaderValue(to)}`,
      `Subject: ${sanitizeHeaderValue(subject)}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "",
      body,
    ];
    const raw = encodeBase64Url(lines.join("\r\n"));
    const response = await client.service.users.drafts.create({
      userId: "me",
      requestBody: {
        message: {
          raw,
          threadId,
        },
      },
    });
    const draftId = response.data.id;
    if (!draftId) {
      throw new Error("Gmail draft created without an id.");
    }
    return draftId;
  }

  public async getLabels(accountId: string): Promise<readonly GmailLabel[]> {
    const client = this.resolveAccountClient(accountId);
    if (!client.service) return [];
    const response = await client.service.users.labels.list({ userId: "me" });
    return (response.data.labels ?? [])
      .filter((label): label is gmail_v1.Schema$Label => Boolean(label.id && label.name))
      .map((label) => ({
        id: label.id ?? "",
        name: label.name ?? "",
      }));
  }

  public async fetchMailSummary(topN = 3): Promise<GmailMailSummary> {
    const accountSummaries = await Promise.all(
      GMAIL_ACCOUNTS.map(async (account): Promise<GmailAccountSummary> => {
        const unreadCount = await this.getUnreadCount(account.id);
        const topUnread = topN > 0
          ? await this.listMessages(account.id, {
            query: "is:unread",
            maxResults: topN,
          })
          : {
            account: account.id,
            messages: [],
          };

        return {
          accountId: account.id,
          label: account.label ?? account.id,
          email: account.email,
          unreadCount,
          topUnread: topUnread.messages,
          warning: topUnread.warning,
        };
      }),
    );

    const totalUnread = accountSummaries.reduce((sum, item) => sum + item.unreadCount, 0);
    return {
      accounts: accountSummaries,
      totalUnread,
    };
  }

  private resolveAccountClient(accountId: string): AccountClient {
    const existing = this.clients.get(accountId);
    if (existing) return existing;

    const account = GMAIL_ACCOUNTS.find((entry) => entry.id === accountId);
    if (!account) {
      throw new Error(`Unknown Gmail account: ${accountId}`);
    }

    const clientId = getEnv(this.env, "GOOGLE_CLIENT_ID");
    const clientSecret = getEnv(this.env, "GOOGLE_CLIENT_SECRET");
    const redirectUri = getEnv(this.env, "GOOGLE_REDIRECT_URI") ?? DEFAULT_REDIRECT_URI;
    const refreshToken = getEnv(this.env, account.refreshTokenEnvVar);

    let resolved: AccountClient;
    if (!clientId || !clientSecret) {
      resolved = {
        account,
        warning: "Gmail credentials missing (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET).",
      };
    } else if (!refreshToken) {
      resolved = {
        account,
        warning: `Gmail refresh token missing for ${account.id} (${account.refreshTokenEnvVar}).`,
      };
    } else {
      const oauth2 = new this.googleApi.auth.OAuth2(clientId, clientSecret, redirectUri);
      oauth2.setCredentials({ refresh_token: refreshToken });
      resolved = {
        account,
        service: this.googleApi.gmail({ version: "v1", auth: oauth2 }),
      };
    }

    this.clients.set(accountId, resolved);
    return resolved;
  }

  private requireAccountClient(accountId: string): {
    readonly account: GmailAccountConfig;
    readonly service: gmail_v1.Gmail;
  } {
    const client = this.resolveAccountClient(accountId);
    if (!client.service) {
      throw new Error(client.warning ?? `Gmail unavailable for account ${accountId}.`);
    }
    return { account: client.account, service: client.service };
  }
}

