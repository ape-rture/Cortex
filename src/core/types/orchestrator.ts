/**
 * Orchestrator Types
 *
 * The orchestrator is the "Global Workspace" — a thin, non-intelligent
 * scheduler that spawns agents, collects outputs, and routes results.
 *
 * Design rules (from Dennett architecture):
 * 1. Orchestrator has NO reasoning capability
 * 2. It reads config, spawns processes, collects structured JSON
 * 3. Semantic reasoning is delegated to agents (e.g. Triage Agent)
 * 4. Policy rules are deterministic only (rate limits, permissions, dedupe)
 *
 * Design source: decisions/2026-02-02-dennett-architecture.md
 */

import type { AgentOutput, ScoredFinding } from "./agent-output.js";
import type { PermissionEnvelope } from "./permission.js";
import type { ModelRef } from "./routing.js";

// ---------------------------------------------------------------------
// Trigger types — what causes agents to run
// ---------------------------------------------------------------------

export type TriggerType =
  | "cron"
  | "slack"
  | "webhook"
  | "file_change"
  | "cli"
  | "agent_request";

export interface Trigger {
  readonly type: TriggerType;

  /** Cron expression (for cron triggers) or event name */
  readonly schedule?: string;

  /** Which agents this trigger activates */
  readonly agents: readonly string[];

  /** Optional payload from the trigger source */
  readonly payload?: Record<string, unknown>;
}

// ---------------------------------------------------------------------
// Agent spawn configuration
// ---------------------------------------------------------------------

export interface AgentSpawnConfig {
  /** Agent identifier — matches PermissionEnvelope.agent */
  readonly agent: string;

  /** Path to the agent's system prompt file */
  readonly prompt_path: string;

  /** Permission envelope for this agent */
  readonly permissions: PermissionEnvelope;

  /** How this agent executes */
  readonly execution_type: "claude_api" | "openai_api" | "local_script" | "mcp_tool";

  /** Model to use (from permission envelope, can be overridden) */
  readonly model: ModelRef;
}

// ---------------------------------------------------------------------
// Cycle — one round of agent execution
// ---------------------------------------------------------------------

export interface OrchestratorCycle {
  /** Unique cycle identifier */
  readonly cycle_id: string;

  /** ISO-8601 timestamp when the cycle started */
  readonly started_at: string;

  /** What triggered this cycle */
  readonly trigger: Trigger;

  /** Agents that were spawned in this cycle */
  readonly agents_spawned: readonly string[];

  /** Raw outputs collected from agents */
  readonly agent_outputs: readonly AgentOutput[];

  /** Scored and ranked findings (post salience scorer) */
  readonly scored_findings: readonly ScoredFinding[];

  /** Findings that passed the fame threshold */
  readonly surfaced: readonly ScoredFinding[];

  /** ISO-8601 timestamp when the cycle completed */
  completed_at?: string;

  /** Errors at the orchestrator level (not agent-level) */
  readonly errors: readonly string[];
}

// ---------------------------------------------------------------------
// Orchestrator configuration
// ---------------------------------------------------------------------

export interface OrchestratorConfig {
  /** Agent definitions with their spawn configs */
  readonly agents: Record<string, AgentSpawnConfig>;

  /** Trigger definitions */
  readonly triggers: readonly Trigger[];

  /** Salience threshold — findings below this don't surface */
  readonly fame_threshold: number;

  /** Max agents that can run in parallel */
  readonly max_parallel_agents: number;

  /** Max escalations per agent per cycle */
  readonly max_escalations_per_agent: number;

  /** Path to routing config (context/model-routing.json) */
  readonly routing_config_path: string;
}

// ---------------------------------------------------------------------
// Orchestrator interface — what gets implemented in Phase 5
// ---------------------------------------------------------------------

export interface Orchestrator {
  /** Execute a single cycle: spawn agents, collect outputs, score, surface */
  runCycle(trigger: Trigger): Promise<OrchestratorCycle>;

  /** Register a new agent configuration */
  registerAgent(config: AgentSpawnConfig): void;

  /** Reload all configuration from disk */
  reloadConfig(): Promise<void>;

  /** Get status of the last N cycles */
  history(n: number): readonly OrchestratorCycle[];
}
