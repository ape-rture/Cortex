/**
 * Agent Event Model
 *
 * Streaming lifecycle events for agent execution. Inspired by Takopi's
 * normalized event model (StartedEvent, ActionEvent, CompletedEvent).
 *
 * These events wrap — not replace — the existing AgentOutput type.
 * AgentOutput is the batch result after completion; events provide
 * real-time visibility into agent execution as it happens.
 *
 * Use cases:
 * - Progress streaming to Slack / Telegram / Web UI
 * - Orchestrator monitoring of running agents
 * - Salience scoring on intermediate actions (not just final output)
 *
 * Design source: research/12-takopi-telegram-bridge.md
 * Related: decisions/2026-02-04-takopi-patterns.md
 */

import type { AgentOutput } from "./agent-output.js";

// ---------------------------------------------------------------------
// Action types — what an agent can do during execution
// ---------------------------------------------------------------------

export type AgentActionKind =
  | "tool_call"
  | "file_change"
  | "memory_write"
  | "api_call"
  | "subagent_spawn"
  | "web_search"
  | "note";

export type ActionPhase = "started" | "updated" | "completed";

export interface AgentAction {
  /** What kind of action this is */
  readonly kind: AgentActionKind;

  /** Human-readable label (e.g. tool name, file path, API endpoint) */
  readonly label: string;

  /** Additional context (e.g. tool args, diff preview, search query) */
  readonly detail?: string;
}

// ---------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------

interface BaseEvent {
  /** Agent identifier — matches AgentOutput.agent */
  readonly agent: string;

  /** Orchestrator cycle this event belongs to */
  readonly cycle_id: string;

  /** ISO-8601 timestamp */
  readonly timestamp: string;
}

/**
 * Emitted when an agent starts execution.
 */
export interface StartedEvent extends BaseEvent {
  readonly type: "started";

  /** Resume token for continuing this conversation later */
  readonly resume_token?: string;

  /** Human-readable title for this execution (e.g. "Morning briefing") */
  readonly title?: string;

  /** Which interface triggered this (for cross-interface tracking) */
  readonly interface_origin?: InterfaceType;
}

/**
 * Emitted during execution when the agent performs an observable action.
 * Multiple ActionEvents per execution are expected.
 */
export interface ActionEvent extends BaseEvent {
  readonly type: "action";

  /** What the agent is doing */
  readonly action: AgentAction;

  /** Lifecycle phase of this specific action */
  readonly phase: ActionPhase;

  /** Wall-clock ms since the agent started */
  readonly elapsed_ms: number;
}

/**
 * Emitted when the agent finishes execution (success or failure).
 */
export interface CompletedEvent extends BaseEvent {
  readonly type: "completed";

  /** Whether the agent succeeded */
  readonly ok: boolean;

  /** Error message if ok is false */
  readonly error?: string;

  /**
   * The full agent output. This is the existing AgentOutput type —
   * the event model wraps it, not replaces it.
   */
  readonly output: AgentOutput;

  /** Resume token for continuing from this result */
  readonly resume_token?: string;

  /** Token usage and performance stats */
  readonly usage: EventUsageStats;
}

// ---------------------------------------------------------------------
// Union type
// ---------------------------------------------------------------------

export type AgentEvent = StartedEvent | ActionEvent | CompletedEvent;

// ---------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------

export type InterfaceType = "cli" | "slack" | "telegram" | "web";

export interface EventUsageStats {
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly latency_ms: number;
}

// ---------------------------------------------------------------------
// Event listener — used by orchestrator and transports
// ---------------------------------------------------------------------

/**
 * Callback for receiving agent events in real-time.
 * Transports (Slack, Telegram, Web UI) implement this to stream progress.
 */
export type AgentEventListener = (event: AgentEvent) => void;
