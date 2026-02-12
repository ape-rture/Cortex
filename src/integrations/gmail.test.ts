import { test } from "node:test";
import assert from "node:assert/strict";
import type { google, gmail_v1 } from "googleapis";
import { GoogleGmailClient } from "./gmail.js";

type ListSeed = {
  readonly ids: readonly string[];
  readonly resultSizeEstimate?: number;
};

type AccountFixture = {
  readonly listByQuery: Readonly<Record<string, ListSeed>>;
  readonly messages: Readonly<Record<string, gmail_v1.Schema$Message>>;
  readonly labels?: readonly gmail_v1.Schema$Label[];
  readonly inboxUnreadCount?: number;
};

type GoogleMockCalls = {
  readonly oauth2: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    refreshToken?: string;
  }[];
  readonly gmailInit: { token?: string; accountId?: string }[];
  readonly list: {
    accountId: string;
    query?: string;
    maxResults?: number;
    labelIds?: readonly string[];
  }[];
  readonly get: {
    accountId: string;
    id: string;
    format?: string;
    metadataHeaders?: readonly string[];
  }[];
  readonly modify: {
    accountId: string;
    id: string;
    addLabelIds?: readonly string[];
    removeLabelIds?: readonly string[];
  }[];
  readonly trash: { accountId: string; id: string }[];
  readonly drafts: {
    accountId: string;
    raw?: string;
    threadId?: string;
  }[];
  readonly labels: { accountId: string }[];
};

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function messageFixture(config: {
  id: string;
  threadId?: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet?: string;
  labelIds?: readonly string[];
  plainBody?: string;
  htmlBody?: string;
  hasAttachment?: boolean;
}): gmail_v1.Schema$Message {
  const parts: gmail_v1.Schema$MessagePart[] = [];
  if (config.plainBody) {
    parts.push({
      mimeType: "text/plain",
      body: {
        data: encodeBase64Url(config.plainBody),
      },
    });
  }
  if (config.htmlBody) {
    parts.push({
      mimeType: "text/html",
      body: {
        data: encodeBase64Url(config.htmlBody),
      },
    });
  }
  if (config.hasAttachment) {
    parts.push({
      mimeType: "application/pdf",
      filename: "invoice.pdf",
      body: {
        attachmentId: "att-1",
      },
    });
  }

  return {
    id: config.id,
    threadId: config.threadId ?? `thread-${config.id}`,
    snippet: config.snippet ?? "",
    labelIds: config.labelIds ? [...config.labelIds] : [],
    payload: {
      mimeType: "multipart/mixed",
      headers: [
        { name: "From", value: config.from },
        { name: "To", value: config.to },
        { name: "Subject", value: config.subject },
        { name: "Date", value: config.date },
      ],
      parts,
    },
  };
}

function createGoogleMock(input: {
  fixtures: Readonly<Record<string, AccountFixture>>;
  tokenToAccountId: Readonly<Record<string, string>>;
}): {
  googleApi: Pick<typeof google, "auth" | "gmail">;
  calls: GoogleMockCalls;
} {
  const calls: GoogleMockCalls = {
    oauth2: [],
    gmailInit: [],
    list: [],
    get: [],
    modify: [],
    trash: [],
    drafts: [],
    labels: [],
  };

  class FakeOAuth2 {
    public refreshToken?: string;

    public constructor(
      clientId: string,
      clientSecret: string,
      redirectUri: string,
    ) {
      calls.oauth2.push({ clientId, clientSecret, redirectUri });
    }

    public setCredentials(credentials: { refresh_token?: string }): void {
      this.refreshToken = credentials.refresh_token;
      const latest = calls.oauth2[calls.oauth2.length - 1];
      if (latest) {
        latest.refreshToken = credentials.refresh_token;
      }
    }
  }

  function createService(accountId: string): gmail_v1.Gmail {
    const fixture = input.fixtures[accountId];
    if (!fixture) {
      throw new Error(`Missing fixture for account: ${accountId}`);
    }

    const service = {
      users: {
        messages: {
          list: async (params: {
            q?: string;
            maxResults?: number;
            labelIds?: readonly string[];
          }) => {
            calls.list.push({
              accountId,
              query: params.q,
              maxResults: params.maxResults,
              labelIds: params.labelIds,
            });
            const key = params.q ?? "";
            const seed = fixture.listByQuery[key] ?? { ids: [] };
            const max = params.maxResults ?? seed.ids.length;
            const ids = seed.ids.slice(0, max).map((id) => ({ id }));
            return {
              data: {
                messages: ids,
                resultSizeEstimate: seed.resultSizeEstimate ?? seed.ids.length,
              },
            };
          },
          get: async (params: {
            id: string;
            format?: string;
            metadataHeaders?: readonly string[];
          }) => {
            calls.get.push({
              accountId,
              id: params.id,
              format: params.format,
              metadataHeaders: params.metadataHeaders,
            });
            const message = fixture.messages[params.id];
            if (!message) {
              throw new Error("Requested entity was not found.");
            }
            return { data: message };
          },
          modify: async (params: {
            id: string;
            requestBody?: {
              addLabelIds?: readonly string[];
              removeLabelIds?: readonly string[];
            };
          }) => {
            calls.modify.push({
              accountId,
              id: params.id,
              addLabelIds: params.requestBody?.addLabelIds,
              removeLabelIds: params.requestBody?.removeLabelIds,
            });
            return { data: {} };
          },
          trash: async (params: { id: string }) => {
            calls.trash.push({ accountId, id: params.id });
            return { data: {} };
          },
        },
        drafts: {
          create: async (params: {
            requestBody?: {
              message?: {
                raw?: string;
                threadId?: string;
              };
            };
          }) => {
            calls.drafts.push({
              accountId,
              raw: params.requestBody?.message?.raw,
              threadId: params.requestBody?.message?.threadId,
            });
            return { data: { id: `draft-${accountId}-1` } };
          },
        },
        labels: {
          list: async () => {
            calls.labels.push({ accountId });
            return { data: { labels: fixture.labels ? [...fixture.labels] : [] } };
          },
          get: async (_params: { id: string }) => {
            return { data: { messagesUnread: fixture.inboxUnreadCount ?? 0 } };
          },
        },
      },
    };

    return service as unknown as gmail_v1.Gmail;
  }

  const googleApi = {
    auth: {
      OAuth2: FakeOAuth2 as unknown as typeof google.auth.OAuth2,
    },
    gmail: (params: { version: "v1"; auth: unknown }) => {
      const auth = params.auth as FakeOAuth2;
      const token = auth.refreshToken;
      const accountId = token ? input.tokenToAccountId[token] : undefined;
      calls.gmailInit.push({ token, accountId });
      if (!accountId) {
        throw new Error("Missing token to account mapping.");
      }
      return createService(accountId);
    },
  } as Pick<typeof google, "auth" | "gmail">;

  return { googleApi, calls };
}

function createEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    GOOGLE_CLIENT_ID: "client-id",
    GOOGLE_CLIENT_SECRET: "client-secret",
    GOOGLE_REDIRECT_URI: "http://localhost/oauth",
    GMAIL_INDEXING_REFRESH_TOKEN: "token-indexing",
    GMAIL_PERSONAL_REFRESH_TOKEN: "token-personal",
    ...overrides,
  };
}

test("GoogleGmailClient supports multi-account auth and header parsing", async () => {
  const fixtures: Record<string, AccountFixture> = {
    indexing: {
      listByQuery: {
        "": { ids: ["idx-1", "idx-2"], resultSizeEstimate: 2 },
      },
      messages: {
        "idx-1": messageFixture({
          id: "idx-1",
          from: "Billing <billing@indexing.co>",
          to: "Dennis <dennis@indexing.co>, Ops <ops@indexing.co>",
          subject: "Action required: invoice approval",
          date: "Tue, 10 Feb 2026 08:00:00 +0000",
          snippet: "Please approve invoice",
          labelIds: ["UNREAD", "IMPORTANT"],
          hasAttachment: true,
        }),
        "idx-2": messageFixture({
          id: "idx-2",
          from: "Alerts <alerts@indexing.co>",
          to: "Dennis <dennis@indexing.co>",
          subject: "Build completed",
          date: "Tue, 10 Feb 2026 09:00:00 +0000",
          snippet: "All good",
          labelIds: [],
        }),
      },
    },
    personal: {
      listByQuery: {
        "": { ids: ["per-1"], resultSizeEstimate: 1 },
      },
      messages: {
        "per-1": messageFixture({
          id: "per-1",
          from: "Friend <friend@example.com>",
          to: "Dennis <dennisverstappen1@gmail.com>",
          subject: "Dinner Friday",
          date: "Tue, 10 Feb 2026 10:00:00 +0000",
        }),
      },
    },
  };

  const { googleApi, calls } = createGoogleMock({
    fixtures,
    tokenToAccountId: {
      "token-indexing": "indexing",
      "token-personal": "personal",
    },
  });

  const client = new GoogleGmailClient({
    googleApi,
    env: createEnv(),
  });

  const indexing = await client.listMessages("indexing");
  const personal = await client.listMessages("personal");

  assert.equal(indexing.messages.length, 2);
  assert.equal(indexing.messages[0]?.from, "Billing <billing@indexing.co>");
  assert.deepEqual(indexing.messages[0]?.to, [
    "Dennis <dennis@indexing.co>",
    "Ops <ops@indexing.co>",
  ]);
  assert.equal(indexing.messages[0]?.subject, "Action required: invoice approval");
  assert.equal(indexing.messages[0]?.isUnread, true);
  assert.equal(indexing.messages[0]?.hasAttachments, true);
  assert.equal(personal.messages.length, 1);

  assert.equal(calls.oauth2.length, 2);
  assert.deepEqual(
    calls.gmailInit.map((entry) => entry.accountId).sort(),
    ["indexing", "personal"],
  );
});

test("GoogleGmailClient getMessage extracts plain and html body", async () => {
  const fixtures: Record<string, AccountFixture> = {
    indexing: {
      listByQuery: {},
      messages: {
        "msg-1": messageFixture({
          id: "msg-1",
          from: "Sender <sender@indexing.co>",
          to: "Dennis <dennis@indexing.co>",
          subject: "Weekly update",
          date: "Tue, 10 Feb 2026 11:00:00 +0000",
          plainBody: "Plain body line 1\nline 2",
          htmlBody: "<p>HTML body</p>",
        }),
      },
    },
    personal: {
      listByQuery: {},
      messages: {},
    },
  };

  const { googleApi } = createGoogleMock({
    fixtures,
    tokenToAccountId: {
      "token-indexing": "indexing",
      "token-personal": "personal",
    },
  });

  const client = new GoogleGmailClient({ googleApi, env: createEnv() });
  const message = await client.getMessage("indexing", "msg-1");

  assert.equal(message.body, "Plain body line 1\nline 2");
  assert.equal(message.htmlBody, "<p>HTML body</p>");
  assert.equal(message.headers.subject, "Weekly update");
});

test("GoogleGmailClient applies archive/trash/label operations in batch", async () => {
  const fixtures: Record<string, AccountFixture> = {
    indexing: {
      listByQuery: {},
      messages: {},
    },
    personal: {
      listByQuery: {},
      messages: {},
    },
  };
  const { googleApi, calls } = createGoogleMock({
    fixtures,
    tokenToAccountId: {
      "token-indexing": "indexing",
      "token-personal": "personal",
    },
  });

  const client = new GoogleGmailClient({ googleApi, env: createEnv() });
  await client.archiveMessages("indexing", ["m-1", "m-2"]);
  await client.trashMessages("indexing", ["m-3"]);
  await client.addLabel("indexing", ["m-4", "m-5"], "Label_1");
  await client.removeLabel("indexing", ["m-6"], "Label_2");

  assert.equal(calls.modify.length, 5);
  assert.deepEqual(
    calls.modify.filter((entry) => entry.removeLabelIds?.includes("INBOX")).map((entry) => entry.id).sort(),
    ["m-1", "m-2"],
  );
  assert.deepEqual(
    calls.modify.filter((entry) => entry.addLabelIds?.includes("Label_1")).map((entry) => entry.id).sort(),
    ["m-4", "m-5"],
  );
  assert.deepEqual(
    calls.modify.filter((entry) => entry.removeLabelIds?.includes("Label_2")).map((entry) => entry.id),
    ["m-6"],
  );
  assert.deepEqual(calls.trash.map((entry) => entry.id), ["m-3"]);
});

test("GoogleGmailClient fetchMailSummary aggregates unread counts and top unread", async () => {
  const fixtures: Record<string, AccountFixture> = {
    indexing: {
      listByQuery: {
        "is:unread": { ids: ["idx-1", "idx-2", "idx-3"], resultSizeEstimate: 7 },
      },
      messages: {
        "idx-1": messageFixture({
          id: "idx-1",
          from: "A <a@indexing.co>",
          to: "Dennis <dennis@indexing.co>",
          subject: "Urgent: legal review",
          date: "Tue, 10 Feb 2026 07:00:00 +0000",
          labelIds: ["UNREAD"],
        }),
        "idx-2": messageFixture({
          id: "idx-2",
          from: "B <b@indexing.co>",
          to: "Dennis <dennis@indexing.co>",
          subject: "Update",
          date: "Tue, 10 Feb 2026 06:00:00 +0000",
          labelIds: ["UNREAD"],
        }),
        "idx-3": messageFixture({
          id: "idx-3",
          from: "C <c@indexing.co>",
          to: "Dennis <dennis@indexing.co>",
          subject: "FYI",
          date: "Tue, 10 Feb 2026 05:00:00 +0000",
          labelIds: ["UNREAD"],
        }),
      },
      labels: [{ id: "INBOX", name: "INBOX" }],
      inboxUnreadCount: 7,
    },
    personal: {
      listByQuery: {
        "is:unread": { ids: ["per-1"], resultSizeEstimate: 1 },
      },
      messages: {
        "per-1": messageFixture({
          id: "per-1",
          from: "Friend <friend@example.com>",
          to: "Dennis <dennisverstappen1@gmail.com>",
          subject: "Check this out",
          date: "Tue, 10 Feb 2026 05:00:00 +0000",
          labelIds: ["UNREAD"],
        }),
      },
      labels: [{ id: "Label_1", name: "Travel" }],
      inboxUnreadCount: 1,
    },
  };

  const { googleApi, calls } = createGoogleMock({
    fixtures,
    tokenToAccountId: {
      "token-indexing": "indexing",
      "token-personal": "personal",
    },
  });

  const client = new GoogleGmailClient({ googleApi, env: createEnv() });
  const summary = await client.fetchMailSummary(2);

  assert.equal(summary.totalUnread, 8);
  const indexing = summary.accounts.find((account) => account.accountId === "indexing");
  const personal = summary.accounts.find((account) => account.accountId === "personal");
  assert.equal(indexing?.unreadCount, 7);
  assert.equal(indexing?.topUnread.length, 2);
  assert.equal(personal?.unreadCount, 1);
  assert.equal(personal?.topUnread.length, 1);
  assert.equal(
    calls.get.filter((entry) => entry.accountId === "indexing").length,
    2,
  );
});

test("GoogleGmailClient createDraft builds RFC 2822 draft and returns id", async () => {
  const fixtures: Record<string, AccountFixture> = {
    indexing: {
      listByQuery: {},
      messages: {},
    },
    personal: {
      listByQuery: {},
      messages: {},
    },
  };
  const { googleApi, calls } = createGoogleMock({
    fixtures,
    tokenToAccountId: {
      "token-indexing": "indexing",
      "token-personal": "personal",
    },
  });

  const client = new GoogleGmailClient({ googleApi, env: createEnv() });
  const draftId = await client.createDraft(
    "indexing",
    "user@example.com",
    "Re: Status update",
    "Draft body here",
    "thread-123",
  );

  assert.equal(draftId, "draft-indexing-1");
  assert.equal(calls.drafts.length, 1);
  assert.equal(calls.drafts[0]?.threadId, "thread-123");
  const raw = calls.drafts[0]?.raw ?? "";
  const decoded = decodeBase64Url(raw);
  assert.ok(decoded.includes("To: user@example.com"));
  assert.ok(decoded.includes("Subject: Re: Status update"));
  assert.ok(decoded.includes("Draft body here"));
});

test("GoogleGmailClient gracefully falls back when account refresh token is missing", async () => {
  const fixtures: Record<string, AccountFixture> = {
    indexing: {
      listByQuery: {
        "is:unread": { ids: ["idx-1"], resultSizeEstimate: 1 },
      },
      messages: {
        "idx-1": messageFixture({
          id: "idx-1",
          from: "Sender <sender@indexing.co>",
          to: "Dennis <dennis@indexing.co>",
          subject: "Hello",
          date: "Tue, 10 Feb 2026 12:00:00 +0000",
          labelIds: ["UNREAD"],
        }),
      },
    },
    personal: {
      listByQuery: {
        "is:unread": { ids: ["per-1"], resultSizeEstimate: 4 },
      },
      messages: {},
    },
  };
  const { googleApi, calls } = createGoogleMock({
    fixtures,
    tokenToAccountId: {
      "token-indexing": "indexing",
      "token-personal": "personal",
    },
  });

  const client = new GoogleGmailClient({
    googleApi,
    env: createEnv({
      GMAIL_PERSONAL_REFRESH_TOKEN: "",
    }),
  });

  const personalList = await client.listMessages("personal");
  assert.equal(personalList.messages.length, 0);
  assert.ok(personalList.warning?.includes("Gmail refresh token missing for personal"));

  const summary = await client.fetchMailSummary(3);
  const personalSummary = summary.accounts.find((account) => account.accountId === "personal");
  assert.equal(personalSummary?.unreadCount, 0);
  assert.ok(personalSummary?.warning?.includes("Gmail refresh token missing for personal"));

  const personalApiCalls = calls.list.filter((call) => call.accountId === "personal");
  assert.equal(personalApiCalls.length, 0);
});

