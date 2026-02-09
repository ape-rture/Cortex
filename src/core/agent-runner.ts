/**
 * Agent Runner
 *
 * Executes a single agent and returns its AgentOutput. Handles both
 * local_script (TypeScript functions) and API-based agents (Phase 7).
 * Emits lifecycle events for real-time progress streaming.
 *
 * Design source: decisions/2026-02-02-dennett-architecture.md
 */

import type { AgentOutput } from "./types/agent-output.js";
import type {
  AgentEvent,
  AgentEventListener,
  CompletedEvent,
  StartedEvent,
} from "./types/events.js";
import type { AgentSpawnConfig, Trigger } from "./types/orchestrator.js";

// ---------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------

export interface AgentRunContext {
  readonly agent: string;
  readonly cycle_id: string;
  readonly trigger: Trigger;
  readonly basePath: string;
}

export type AgentFunction = (context: AgentRunContext) => Promise<AgentOutput>;

// ---------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString();
}

function makeErrorOutput(agent: string, error: string): AgentOutput {
  return {
    agent,
    timestamp: nowIso(),
    findings: [],
    memory_updates: [],
    errors: [error],
  };
}

export class AgentRunner {
  private readonly localAgents = new Map<string, AgentFunction>();
  private readonly onEvent?: AgentEventListener;

  constructor(onEvent?: AgentEventListener) {
    this.onEvent = onEvent;
  }

  registerLocal(agent: string, fn: AgentFunction): void {
    this.localAgents.set(agent, fn);
  }

  async run(config: AgentSpawnConfig, context: AgentRunContext): Promise<AgentOutput> {
    const startTime = Date.now();

    this.emit({
      type: "started",
      agent: config.agent,
      cycle_id: context.cycle_id,
      timestamp: nowIso(),
      title: `Running ${config.agent}`,
    } satisfies StartedEvent);

    let output: AgentOutput;

    try {
      const timeoutMs = config.permissions.timeout_ms || 30000;
      output = await withTimeout(
        this.execute(config, context),
        timeoutMs,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      output = makeErrorOutput(config.agent, message);
    }

    const latencyMs = Date.now() - startTime;

    this.emit({
      type: "completed",
      agent: config.agent,
      cycle_id: context.cycle_id,
      timestamp: nowIso(),
      ok: output.errors.length === 0,
      error: output.errors.length > 0 ? output.errors.join("; ") : undefined,
      output,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: latencyMs,
      },
    } satisfies CompletedEvent);

    return output;
  }

  private async execute(
    config: AgentSpawnConfig,
    context: AgentRunContext,
  ): Promise<AgentOutput> {
    switch (config.execution_type) {
      case "local_script": {
        const fn = this.localAgents.get(config.agent);
        if (!fn) {
          throw new Error(
            `No local agent registered for "${config.agent}". ` +
            `Call runner.registerLocal("${config.agent}", fn) first.`,
          );
        }
        return await fn(context);
      }

      case "claude_api":
      case "openai_api":
        throw new Error(
          `${config.execution_type} execution not yet implemented. ` +
          `Only local_script agents are supported in the MVP.`,
        );

      case "mcp_tool":
        throw new Error(
          "mcp_tool execution not yet implemented. " +
          "Only local_script agents are supported in the MVP.",
        );

      default:
        throw new Error(`Unknown execution type: ${config.execution_type}`);
    }
  }

  private emit(event: AgentEvent): void {
    if (this.onEvent) {
      try {
        this.onEvent(event);
      } catch {
        // Don't let listener errors break the agent
      }
    }
  }
}

// ---------------------------------------------------------------------
// Timeout utility
// ---------------------------------------------------------------------

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Agent timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
