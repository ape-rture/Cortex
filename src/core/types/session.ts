/**
 * Session Snapshot & Warm Handoff types.
 *
 * A session snapshot captures the "mental state" when a session ends
 * so the next session (same agent or different) can reconstruct context
 * without a cold start.
 *
 * Stored at `.cortex/snapshot.md`, overwritten each session.
 * The /gm morning routine reads the latest snapshot.
 */

/** Who created this snapshot. */
export type SnapshotAgent = "claude" | "codex" | "dennis" | "runtime";

export interface SessionSnapshot {
  /** Which agent wrote this snapshot. */
  readonly agent: SnapshotAgent;
  /** ISO datetime when the session ended. */
  readonly ended_at: string;
  /** Git branch the agent was on. */
  readonly branch?: string;
  /** One-line summary of what was being worked on. */
  readonly working_on: string;
  /** Tasks that were started but not completed. */
  readonly unfinished: readonly string[];
  /** What should happen next (ordered by priority). */
  readonly next_steps: readonly string[];
  /** Questions or decisions that need Dennis's input. */
  readonly open_questions: readonly string[];
  /** Key file paths that are relevant context. */
  readonly key_files: readonly string[];
}

export interface SessionSnapshotStore {
  /** Write a snapshot, overwriting any previous one. */
  capture(snapshot: SessionSnapshot): Promise<void>;
  /** Read the latest snapshot, or undefined if none exists. */
  load(): Promise<SessionSnapshot | undefined>;
}

// ---------------------------------------------------------------------
// Resume Tokens (Takopi-inspired)
//
// Lightweight, token-based session continuity. Every completed agent
// execution produces a resume token. Any interface (CLI, Slack,
// Telegram, Web) can use the token to continue the conversation.
//
// Unlike SessionSnapshot (full state dump, single latest), resume
// tokens are many-to-one: multiple tokens can exist, each pointing
// to a specific point in a conversation.
//
// Storage: .cortex/resume-tokens.json (auto-pruned to recent N tokens)
//
// Design source: research/12-takopi-telegram-bridge.md
// Related: decisions/2026-02-04-takopi-patterns.md
// ---------------------------------------------------------------------

/** Where the conversation was happening when the token was created. */
export type InterfaceOrigin = "cli" | "slack" | "telegram" | "web";

export interface ResumeToken {
  /** Short unique identifier (e.g. nanoid). Used to resume. */
  readonly token: string;

  /** Which agent produced this token */
  readonly agent: SnapshotAgent;

  /** Orchestrator cycle ID this token belongs to */
  readonly cycle_id: string;

  /** ISO-8601 timestamp when the token was created */
  readonly created_at: string;

  /** Full session state at the time of token creation */
  readonly snapshot: SessionSnapshot;

  /** Which interface the user was on when this token was created */
  readonly interface_origin: InterfaceOrigin;

  /** Optional conversation thread ID (Slack thread, Telegram chat, etc.) */
  readonly thread_id?: string;
}

export interface ResumeTokenStore {
  /** Save a new resume token. */
  save(token: ResumeToken): Promise<void>;

  /** Look up a resume token by its short ID. */
  load(token: string): Promise<ResumeToken | undefined>;

  /** List the N most recent tokens, newest first. */
  listRecent(n: number): Promise<readonly ResumeToken[]>;

  /** Remove tokens older than the given ISO-8601 date. */
  prune(before: string): Promise<number>;
}
