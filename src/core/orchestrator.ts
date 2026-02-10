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
import { ConfigAgentRouter, isTaskType } from "./agent-router.js";
import type { AgentRouteRequest } from "./types/routing.js";

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
  private readonly agentRouter: ConfigAgentRouter;
  private readonly cycles: OrchestratorCycle[] = [];
  private readonly listeners = new Set<AgentEventListener>();

  constructor(configPath: string = DEFAULT_CONFIG_PATH) {
    this.configPath = configPath;
    this.scorer = new RuleBasedSalienceScorer();
    this.validator = new PermissionValidator();
    this.writer = new MemoryWriter();
    this.agentRouter = new ConfigAgentRouter(configPath);

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

    // Cycle-level timeout — hard cap on the entire cycle including retries
    const cycleTimeoutMs = this.config.max_cycle_timeout_ms ?? 600_000; // 10 min default
    const cycleStart = Date.now();
    const isCycleExpired = () => Date.now() - cycleStart >= cycleTimeoutMs;

    // Capture events for this cycle
    const captureEvent = (event: AgentEvent) => {
      events.push(event);
    };
    this.listeners.add(captureEvent);

    try {
      // Determine which agents to run
      const explicitAgents = trigger.agents ?? [];
      let agentNames: string[];
      if (explicitAgents.length > 0) {
        agentNames = explicitAgents.includes("*")
          ? Array.from(this.agents.keys())
          : explicitAgents.filter((name) => this.agents.has(name));
      } else {
        const routed = await this.agentRouter.resolve(this.toAgentRouteRequest(trigger));
        agentNames = this.agents.has(routed.agent)
          ? [routed.agent]
          : [];
      }

      if (agentNames.length === 0) {
        agentNames = Array.from(this.agents.keys());
      }

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

      // Escalation loop: evaluate salvaged results and decide whether to retry.
      //
      // Decision logic (no reasoning — just scoring):
      // 1. Score the salvaged findings through the salience scorer
      // 2. If any finding passes the fame threshold → results are good enough, skip retry
      // 3. If nothing surfaces → retry with doubled turns
      //
      // This keeps the orchestrator mechanistic per Dennett principles.
      const maxRetries = this.config!.max_escalations_per_agent ?? 0;
      if (maxRetries > 0 && !isCycleExpired()) {
        for (let i = 0; i < agent_outputs.length; i++) {
          if (isCycleExpired()) break;

          const output = agent_outputs[i];
          if (!output.escalation_needed) continue;

          const agentName = agentNames[i];
          const agentConfig = this.agents.get(agentName);
          if (!agentConfig || agentConfig.execution_type !== "claude_code") continue;

          // Score salvaged findings — are they good enough?
          if (output.findings.length > 0) {
            const salvageFindings: FindingWithAgent[] = output.findings.map(
              (finding) => ({ finding, agent: agentName }),
            );
            const salvageScored = this.scorer.score(salvageFindings);
            const salvageSurfaced = salvageScored.filter(
              (sf) => sf.salience >= this.config!.fame_threshold,
            );

            if (salvageSurfaced.length > 0) {
              // Partial results pass the fame threshold — good enough, skip retry
              continue;
            }
          }

          // Not good enough — retry with adjusted parameters
          const remainingMs = cycleTimeoutMs - (Date.now() - cycleStart);
          const retryConfig: AgentSpawnConfig = {
            ...agentConfig,
            max_turns: (agentConfig.max_turns ?? 10) * 2,
            permissions: {
              ...agentConfig.permissions,
              timeout_ms: Math.min(agentConfig.permissions.timeout_ms || 300_000, remainingMs),
            },
          };

          try {
            const retryOutput = await this.runner.run(retryConfig, { ...context, agent: agentName });
            if (retryOutput.findings.length > 0 || !retryOutput.escalation_needed) {
              agent_outputs[i] = retryOutput;
            }
          } catch {
            // Keep original salvaged output on retry failure
          }
        }
      }

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
    await this.agentRouter.reloadConfig();

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

  private toAgentRouteRequest(trigger: Trigger): AgentRouteRequest {
    const payload = trigger.payload ?? {};
    const rawTaskType = typeof payload.task_type === "string" ? payload.task_type : undefined;
    const rawPrompt = typeof payload.prompt === "string" ? payload.prompt : "";

    const touches_files = Array.isArray(payload.touches_files)
      ? payload.touches_files.filter((item): item is string => typeof item === "string")
      : undefined;

    return {
      prompt: rawPrompt,
      task_type: rawTaskType && isTaskType(rawTaskType) ? rawTaskType : undefined,
      user_directive: typeof payload.user_directive === "string" ? payload.user_directive : undefined,
      context_key: typeof payload.context_key === "string" ? payload.context_key : undefined,
      touches_files,
    };
  }
}
