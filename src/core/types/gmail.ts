/**
 * Gmail Integration Types
 *
 * Types for multi-account Gmail access, message classification,
 * and cleanup actions.
 */

// ---------------------------------------------------------------------------
// Account configuration
// ---------------------------------------------------------------------------

export interface GmailAccountConfig {
  readonly id: string;
  readonly email: string;
  readonly refreshTokenEnvVar: string;
  readonly label?: string;
}

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

/** Lightweight message header (no body, efficient for listings). */
export interface GmailMessageHeader {
  readonly id: string;
  readonly threadId: string;
  readonly accountId: string;
  readonly from: string;
  readonly to: readonly string[];
  readonly subject: string;
  readonly date: string;
  readonly snippet: string;
  readonly labelIds: readonly string[];
  readonly isUnread: boolean;
  readonly hasAttachments: boolean;
}

/** Full message with body content. */
export interface GmailMessage extends GmailMessageHeader {
  readonly body: string;
  readonly htmlBody?: string;
  readonly headers: Readonly<Record<string, string>>;
}

// ---------------------------------------------------------------------------
// Search / fetch
// ---------------------------------------------------------------------------

export interface GmailSearchOptions {
  readonly query?: string;
  readonly maxResults?: number;
  readonly labelIds?: readonly string[];
  readonly includeBody?: boolean;
  readonly after?: string;
  readonly before?: string;
}

/** Result from listing messages for a single account. */
export interface GmailFetchResult {
  readonly messages: readonly GmailMessageHeader[];
  readonly account: string;
  readonly warning?: string;
  readonly resultSizeEstimate?: number;
}

/** Aggregated summary across accounts (for /gm). */
export interface GmailMailSummary {
  readonly accounts: readonly GmailAccountSummary[];
  readonly totalUnread: number;
}

export interface GmailAccountSummary {
  readonly accountId: string;
  readonly label: string;
  readonly email: string;
  readonly unreadCount: number;
  readonly topUnread: readonly GmailMessageHeader[];
  readonly warning?: string;
}

// ---------------------------------------------------------------------------
// Classification (Phase 3)
// ---------------------------------------------------------------------------

export type MailCategory =
  | "newsletter"
  | "event_invite"
  | "linkedin"
  | "personal"
  | "work"
  | "transactional"
  | "spam"
  | "other";

export type MailSuggestedAction =
  | "keep"
  | "archive"
  | "trash"
  | "review"
  | "draft_reply";

export interface MailClassification {
  readonly messageId: string;
  readonly category: MailCategory;
  readonly confidence: number;
  readonly suggestedAction: MailSuggestedAction;
  readonly reasoning?: string;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type GmailActionType =
  | "archive"
  | "trash"
  | "label"
  | "mark_read"
  | "create_draft";

export interface GmailAction {
  readonly messageId: string;
  readonly accountId: string;
  readonly action: GmailActionType;
  readonly labelId?: string;
  readonly draftBody?: string;
}

// ---------------------------------------------------------------------------
// Client interface
//
// SECURITY POLICY: This client must NEVER support sending emails directly.
// Only draft creation is allowed. Sending is too sensitive to prompt injection
// attacks — an LLM agent processing untrusted email content could be tricked
// into sending replies. Drafts require explicit human review before sending.
// ---------------------------------------------------------------------------

export interface GmailLabel {
  readonly id: string;
  readonly name: string;
}

export interface GmailClient {
  /** List message headers matching a search. */
  listMessages(
    accountId: string,
    options?: GmailSearchOptions,
  ): Promise<GmailFetchResult>;

  /** Fetch a single message with full body. */
  getMessage(
    accountId: string,
    messageId: string,
  ): Promise<GmailMessage>;

  /** Get unread message count for an account. */
  getUnreadCount(accountId: string): Promise<number>;

  /** Remove INBOX label (archive). */
  archiveMessages(
    accountId: string,
    messageIds: readonly string[],
  ): Promise<void>;

  /** Move messages to trash. */
  trashMessages(
    accountId: string,
    messageIds: readonly string[],
  ): Promise<void>;

  /** Add a label to messages. */
  addLabel(
    accountId: string,
    messageIds: readonly string[],
    labelId: string,
  ): Promise<void>;

  /** Remove a label from messages. */
  removeLabel(
    accountId: string,
    messageIds: readonly string[],
    labelId: string,
  ): Promise<void>;

  /** Create a draft reply (does NOT send). */
  createDraft(
    accountId: string,
    to: string,
    subject: string,
    body: string,
    threadId?: string,
  ): Promise<string>;

  /** List available labels for an account. */
  getLabels(accountId: string): Promise<readonly GmailLabel[]>;

  /** Get a summary of all accounts (for /gm). */
  fetchMailSummary(topN?: number): Promise<GmailMailSummary>;
}
