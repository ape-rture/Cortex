/**
 * Cortex Orchestrator
 *
 * The "Global Workspace" — a thin, non-intelligent scheduler that:
 * 1. Spawns agents in parallel
 * 2. Collects structured JSON outputs
 * 3. Validates memory updates against permission envelopes
 * 4. Scores findings by salience
 * 5. Surfaces only what passes the fame threshold
 *
 * The orchestrator has NO reasoning capability. Semantic reasoning
 * is delegated to agents (e.g. Triage Agent in Phase 7).
 *
 * Design source: decisions/2026-02-02-dennett-architecture.md
 */

import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import type { AgentOutput } from "./types/agent-output.js";
import type { AgentEvent, AgentEventListener } from "./types/events.js";
import type {
  AgentSpawnConfig,
  Orchestrator,
  OrchestratorConfig,
  OrchestratorCycle,
  Trigger,
} from "./types/orchestrator.js";
import { AgentRunner } from "./agent-runner.js";
import type { AgentFunction, AgentRunContext } from "./agent-runner.js";
import { RuleBasedSalienceScorer } from "./salience.js";
import type { FindingWithAgent } from "./salience.js";
import { PermissionValidator } from "./permission-validator.js";
import { MemoryWriter } from "./memory-writer.js";

// ---------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------

const DEFAULT_CONFIG_PATH = "context/orchestrator.json";
const MAX_HISTORY = 50;

// ---------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString();
}

export class CortexOrchestrator implements Orchestrator {
  readonly runner: AgentRunner;

  private configPath: string;
  private config: OrchestratorConfig | null = null;
  private readonly agents = new Map<string, AgentSpawnConfig>();
  private readonly scorer: RuleBasedSalienceScorer;
  private readonly validator: PermissionValidator;
  private readonly writer: MemoryWriter;
  private readonly cycles: OrchestratorCycle[] = [];
  private readonly listeners = new Set<AgentEventListener>();

  constructor(configPath: string = DEFAULT_CONFIG_PATH) {
    this.configPath = configPath;
    this.scorer = new RuleBasedSalienceScorer();
    this.validator = new PermissionValidator();
    this.writer = new MemoryWriter();

    // Wire event broadcasting into the runner
    this.runner = new AgentRunner((event: AgentEvent) => {
      for (const listener of this.listeners) {
        try {
          listener(event);
        } catch {
          // Don't let listener errors break the cycle
        }
      }
    });
  }

  // -------------------------------------------------------------------
  // Orchestrator interface
  // -------------------------------------------------------------------

  async runCycle(trigger: Trigger): Promise<OrchestratorCycle> {
    if (!this.config) await this.reloadConfig();
    if (!this.config) throw new Error("Orchestrator config not loaded");

    const cycle_id = randomUUID().slice(0, 8);
    const started_at = nowIso();
    const events: AgentEvent[] = [];

    // Capture events for this cycle
    const captureEvent = (event: AgentEvent) => {
      events.push(event);
    };
    this.listeners.add(captureEvent);

    try {
      // Determine which agents to run
      const agentNames = trigger.agents.includes("*")
        ? Array.from(this.agents.keys())
        : trigger.agents.filter((name) => this.agents.has(name));

      // Spawn agents in parallel
      const context: AgentRunContext = {
        agent: "", // overridden per agent
        cycle_id,
        trigger,
        basePath: process.cwd(),
      };

      const results = await Promise.allSettled(
        agentNames.map((name) => {
          const config = this.agents.get(name)!;
          return this.runner.run(config, { ...context, agent: name });
        }),
      );

      // Collect outputs
      const agent_outputs: AgentOutput[] = results.map((result, i) => {
        if (result.status === "fulfilled") return result.value;
        return {
          agent: agentNames[i],
          timestamp: nowIso(),
          findings: [],
          memory_updates: [],
          errors: [result.reason instanceof Error ? result.reason.message : String(result.reason)],
        };
      });

      // Validate and apply memory updates
      const allApproved: AgentOutput["memory_updates"][number][] = [];
      const allRejected: { update: AgentOutput["memory_updates"][number]; reason: string }[] = [];

      for (const output of agent_outputs) {
        const config = this.agents.get(output.agent);
        if (!config) continue;
        const { approved, rejected } = this.validator.validate(output, config.permissions);
        allApproved.push(...approved);
        allRejected.push(...rejected);
      }

      if (allApproved.length > 0) {
        await this.writer.applyUpdates(allApproved);
      }

      // Score findings
      const allFindings: FindingWithAgent[] = agent_outputs.flatMap((output) =>
        output.findings.map((finding) => ({ finding, agent: output.agent })),
      );

      const scored_findings = this.scorer.score(allFindings);
      const surfaced = scored_findings.filter(
        (sf) => sf.salience >= this.config!.fame_threshold,
      );

      // Collect errors
      const errors = [
        ...allRejected.map((r) => r.reason),
        ...agent_outputs.flatMap((o) => o.errors),
      ];

      // Build cycle record
      const cycle: OrchestratorCycle = {
        cycle_id,
        started_at,
        trigger,
        agents_spawned: agentNames,
        agent_outputs,
        scored_findings,
        surfaced,
        completed_at: nowIso(),
        errors,
        events: [...events],
      };

      // Store in history (ring buffer)
      this.cycles.push(cycle);
      if (this.cycles.length > MAX_HISTORY) {
        this.cycles.shift();
      }

      return cycle;
    } finally {
      this.listeners.delete(captureEvent);
    }
  }

  registerAgent(config: AgentSpawnConfig): void {
    this.agents.set(config.agent, config);
  }

  async reloadConfig(): Promise<void> {
    const raw = await fs.readFile(this.configPath, "utf8");
    this.config = JSON.parse(raw) as OrchestratorConfig;

    // Register all agents from config
    for (const [name, agentConfig] of Object.entries(this.config.agents)) {
      this.agents.set(name, agentConfig);
    }
  }

  history(n: number): readonly OrchestratorCycle[] {
    return this.cycles.slice(-n);
  }

  onEvent(listener: AgentEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
