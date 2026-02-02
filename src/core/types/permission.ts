/**
 * Permission Envelopes
 *
 * Each runtime agent runs inside a permission envelope that scopes
 * what it can read, write, and call. The orchestrator enforces these
 * boundaries before spawning the agent and validates outputs against
 * them before applying memory updates.
 *
 * Design source: decisions/2026-02-02-dennett-architecture.md
 */

// ---------------------------------------------------------------------
// API permission format: "service:scope"
// Examples: "attio:read", "focus:read", "slack:write", "github:read"
// ---------------------------------------------------------------------

export type ApiPermission = `${string}:${"read" | "write" | "readwrite"}`;

// ---------------------------------------------------------------------
// Permission envelope
// ---------------------------------------------------------------------

export interface PermissionEnvelope {
  /** Agent identifier — must match AgentOutput.agent */
  readonly agent: string;

  /**
   * Glob patterns for files the agent may read.
   * Relative to project root.
   * Example: ["contacts/", "meetings/", "context/company.md"]
   */
  readonly can_read: readonly string[];

  /**
   * Glob patterns for files the agent may write.
   * Typically very narrow (e.g. ["actions/queue.md"]).
   */
  readonly can_write: readonly string[];

  /**
   * External API permissions in "service:scope" format.
   * Example: ["attio:read", "focus:read"]
   */
  readonly can_call_apis: readonly ApiPermission[];

  /** Whether this agent may send messages to external channels */
  readonly can_send_messages: boolean;

  /**
   * Operations that require explicit human approval before execution.
   * Example: ["any write to contacts/"]
   */
  readonly requires_human_approval: readonly string[];

  /** Max output tokens the agent's LLM call may use */
  readonly max_tokens: number;

  /**
   * Default model identifier for this agent.
   * Format: "provider:model" (e.g. "anthropic:haiku")
   */
  readonly model: string;

  /** Escalation model if the agent requests a more powerful model */
  readonly escalation_model?: string;

  /** Max wall-clock time before the orchestrator kills the agent */
  readonly timeout_ms: number;
}
