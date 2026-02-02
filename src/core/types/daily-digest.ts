/**
 * Daily Digest types.
 *
 * End-of-day summary capturing what happened, what's open, and what
 * needs attention tomorrow. Written to `daily/YYYY-MM-DD.md`.
 *
 * Data sources: .cortex/log.md, actions/pending.md, actions/queue.md,
 * git log (today's commits), calendar events.
 */

export interface DigestItem {
  /** Short description of the item. */
  readonly summary: string;
  /** Source of this item (log, queue, git, calendar). */
  readonly source: "log" | "queue" | "git" | "calendar" | "pending";
}

export interface DailyDigest {
  /** Date this digest covers (YYYY-MM-DD). */
  readonly date: string;
  /** ISO datetime when the digest was generated. */
  readonly generated_at: string;
  /** Items completed today. */
  readonly accomplished: readonly DigestItem[];
  /** Items still open (in-progress, blocked, or pending). */
  readonly still_open: readonly DigestItem[];
  /** Items that shifted (new blockers, priority changes, deferrals). */
  readonly shifted: readonly DigestItem[];
  /** Suggested focus areas for tomorrow. */
  readonly tomorrow: readonly string[];
}

export interface DigestGenerator {
  /** Generate a digest for the given date (defaults to today). */
  generate(date?: string): Promise<DailyDigest>;
  /** Render a DailyDigest to markdown for writing to daily/. */
  toMarkdown(digest: DailyDigest): string;
}
