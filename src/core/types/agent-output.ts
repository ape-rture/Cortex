/**
 * Agent Output Schema
 *
 * Every runtime agent returns this structure. The orchestrator collects
 * these, runs them through the policy gate and salience scorer, and
 * routes winners to the user.
 *
 * Design source: decisions/2026-02-02-dennett-architecture.md
 */

// ---------------------------------------------------------------------
// Finding types
// ---------------------------------------------------------------------

export type FindingType = "alert" | "insight" | "suggestion" | "action_item";

export type Urgency = "critical" | "high" | "medium" | "low";

export interface Finding {
  /** What kind of output this is */
  readonly type: FindingType;

  /** One-line human-readable description */
  readonly summary: string;

  /** Extended context, shown on expand / drill-down */
  readonly detail?: string;

  /** Time-sensitivity. Drives salience scoring. */
  readonly urgency: Urgency;

  /** 0.0 – 1.0. Agent's self-assessed confidence in this finding. */
  readonly confidence: number;

  /** Plain-language suggestion for what the user could do */
  readonly suggested_action?: string;

  /** Markdown file paths this finding references */
  readonly context_refs: readonly string[];

  /** If true, the orchestrator must not auto-act — surface to user */
  readonly requires_human: boolean;
}

// ---------------------------------------------------------------------
// Memory updates
// ---------------------------------------------------------------------

export type MemoryOperation = "append" | "update" | "flag";

export interface MemoryUpdate {
  /** Relative path from project root (e.g. "contacts/sarah-chen.md") */
  readonly file: string;

  /** How to apply the update */
  readonly operation: MemoryOperation;

  /** Content to write / append */
  readonly content: string;
}

// ---------------------------------------------------------------------
// Agent output envelope
// ---------------------------------------------------------------------

export interface AgentOutput {
  /** Agent identifier (e.g. "sales-watcher", "content-creator") */
  readonly agent: string;

  /** ISO-8601 timestamp of when the agent finished */
  readonly timestamp: string;

  /** Zero or more findings produced by this run */
  readonly findings: readonly Finding[];

  /** Proposed writes to the shared context bus (markdown files) */
  readonly memory_updates: readonly MemoryUpdate[];

  /** Errors encountered during execution. Empty array = success. */
  readonly errors: readonly string[];

  /** If true, the agent is requesting re-run with a more powerful model */
  readonly escalation_needed?: boolean;

  /** Human-readable reason for escalation */
  readonly escalation_reason?: string;
}

// ---------------------------------------------------------------------
// Salience scoring
// ---------------------------------------------------------------------

export interface SalienceWeights {
  readonly urgency: number;
  readonly relevance: number;
  readonly novelty: number;
  readonly actionability: number;
}

export interface ScoredFinding {
  /** The original finding */
  readonly finding: Finding;

  /** Which agent produced it */
  readonly agent: string;

  /** Computed salience score (0.0 – 1.0) */
  readonly salience: number;
}
