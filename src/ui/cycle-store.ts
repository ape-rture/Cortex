import type { AgentOutput } from "../core/types/agent-output.js";
import type { OrchestratorCycle } from "../core/types/orchestrator.js";

export interface CycleSummary {
  readonly cycle_id: string;
  readonly started_at: string;
  readonly completed_at?: string;
  readonly trigger_type: string;
  readonly agents_spawned: readonly string[];
  readonly finding_count: number;
  readonly surfaced_count: number;
  readonly error_count: number;
}

export interface AgentHealth {
  readonly agent: string;
  readonly last_run?: string;
  readonly last_ok: boolean;
  readonly total_runs: number;
  readonly total_errors: number;
  readonly avg_latency_ms: number;
}

export interface CycleStore {
  add(cycle: OrchestratorCycle): void;
  latest(): CycleSummary | null;
  list(limit?: number): readonly CycleSummary[];
  agentHealth(): Record<string, AgentHealth>;
}

type AgentStats = {
  lastRun?: string;
  lastOk: boolean;
  totalRuns: number;
  totalErrors: number;
  latencyMsTotal: number;
  latencySamples: number;
};

const MAX_CYCLES = 200;

function toSummary(cycle: OrchestratorCycle): CycleSummary {
  return {
    cycle_id: cycle.cycle_id,
    started_at: cycle.started_at,
    completed_at: cycle.completed_at,
    trigger_type: cycle.trigger.type,
    agents_spawned: [...cycle.agents_spawned],
    finding_count: cycle.scored_findings.length,
    surfaced_count: cycle.surfaced.length,
    error_count: cycle.errors.length + cycle.agent_outputs.reduce((n, o) => n + o.errors.length, 0),
  };
}

function gatherLatencyByAgent(cycle: OrchestratorCycle): Map<string, number> {
  const map = new Map<string, number>();
  for (const event of cycle.events) {
    if (event.type !== "completed") continue;
    map.set(event.agent, event.usage.latency_ms);
  }
  return map;
}

function updateStats(
  stats: Map<string, AgentStats>,
  output: AgentOutput,
  latencyByAgent: Map<string, number>,
): void {
  const current = stats.get(output.agent) ?? {
    lastOk: true,
    totalRuns: 0,
    totalErrors: 0,
    latencyMsTotal: 0,
    latencySamples: 0,
  };

  const runHasErrors = output.errors.length > 0;
  current.lastRun = output.timestamp;
  current.lastOk = !runHasErrors;
  current.totalRuns += 1;
  if (runHasErrors) {
    current.totalErrors += 1;
  }

  const latency = latencyByAgent.get(output.agent);
  if (typeof latency === "number" && Number.isFinite(latency)) {
    current.latencyMsTotal += latency;
    current.latencySamples += 1;
  }

  stats.set(output.agent, current);
}

export class InMemoryCycleStore implements CycleStore {
  private readonly cycles: OrchestratorCycle[] = [];

  add(cycle: OrchestratorCycle): void {
    this.cycles.push(cycle);
    if (this.cycles.length > MAX_CYCLES) {
      this.cycles.shift();
    }
  }

  latest(): CycleSummary | null {
    const cycle = this.cycles[this.cycles.length - 1];
    return cycle ? toSummary(cycle) : null;
  }

  list(limit = 10): readonly CycleSummary[] {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 10;
    return this.cycles
      .slice(-safeLimit)
      .reverse()
      .map(toSummary);
  }

  agentHealth(): Record<string, AgentHealth> {
    const stats = new Map<string, AgentStats>();

    for (const cycle of this.cycles) {
      const latencyByAgent = gatherLatencyByAgent(cycle);
      for (const output of cycle.agent_outputs) {
        updateStats(stats, output, latencyByAgent);
      }
    }

    const result: Record<string, AgentHealth> = {};
    for (const [agent, s] of stats.entries()) {
      result[agent] = {
        agent,
        last_run: s.lastRun,
        last_ok: s.lastOk,
        total_runs: s.totalRuns,
        total_errors: s.totalErrors,
        avg_latency_ms:
          s.latencySamples > 0
            ? Math.round(s.latencyMsTotal / s.latencySamples)
            : 0,
      };
    }
    return result;
  }
}

export function summarizeCycle(cycle: OrchestratorCycle): CycleSummary {
  return toSummary(cycle);
}
