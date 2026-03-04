/**
 * Agent Runner
 *
 * Executes a single agent and returns its AgentOutput.
 * Uses pluggable execution backends (Phase 11e).
 */

import type { AgentOutput } from "./types/agent-output.js";
import type {
  AgentEvent,
  AgentEventListener,
  CompletedEvent,
  StartedEvent,
} from "./types/events.js";
import type {
  AgentPlugin,
  AgentPluginContext,
  AgentPluginResult,
  AgentPluginSession,
  AgentSpawnConfig,
  Trigger,
} from "./types/orchestrator.js";
import { createDefaultPlugins } from "./agent-plugins.js";

// ---------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------

export interface AgentRunContext {
  readonly agent: string;
  readonly cycle_id: string;
  readonly trigger: Trigger;
  readonly basePath: string;
  readonly task_prompt?: string;
  readonly workingDir?: string;
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class AgentRunner {
  private readonly localAgents = new Map<string, AgentFunction>();
  private readonly plugins = new Map<AgentSpawnConfig["execution_type"], AgentPlugin>();
  private readonly onEvent?: AgentEventListener;

  constructor(onEvent?: AgentEventListener) {
    this.onEvent = onEvent;

    const defaults = createDefaultPlugins(async (config, pluginContext) => {
      const fn = this.localAgents.get(config.agent);
      if (!fn) {
        throw new Error(
          `No local agent registered for "${config.agent}". ` +
          `Call runner.registerLocal("${config.agent}", fn) first.`,
        );
      }

      return await fn({
        agent: config.agent,
        cycle_id: pluginContext.cycle_id,
        trigger: pluginContext.trigger,
        basePath: pluginContext.basePath,
        ...(pluginContext.task_prompt ? { task_prompt: pluginContext.task_prompt } : {}),
        ...(pluginContext.workingDir ? { workingDir: pluginContext.workingDir } : {}),
      });
    });

    for (const [executionType, plugin] of Object.entries(defaults) as Array<
      [AgentSpawnConfig["execution_type"], AgentPlugin]
    >) {
      this.plugins.set(executionType, plugin);
    }
  }

  registerLocal(agent: string, fn: AgentFunction): void {
    this.localAgents.set(agent, fn);
  }

  registerPlugin(executionType: AgentSpawnConfig["execution_type"], plugin: AgentPlugin): void {
    this.plugins.set(executionType, plugin);
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
      const plugin = this.plugins.get(config.execution_type);
      if (!plugin) {
        throw new Error(`Unknown execution type: ${config.execution_type}`);
      }

      const pluginContext: AgentPluginContext = {
        cycle_id: context.cycle_id,
        trigger: context.trigger,
        basePath: context.basePath,
        ...(context.task_prompt ? { task_prompt: context.task_prompt } : {}),
        ...(context.workingDir ? { workingDir: context.workingDir } : {}),
      };

      const session = await plugin.spawn(config, pluginContext);
      const timeoutMs = config.permissions.timeout_ms || 30_000;

      const result = await withTimeout(
        this.waitForPluginResult(plugin, session),
        timeoutMs,
      ).catch(async (error) => {
        await plugin.kill(session).catch(() => undefined);
        throw error;
      });

      if (result.output) {
        output = result.output;
      } else {
        output = makeErrorOutput(config.agent, result.error ?? "Agent completed without output");
      }
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

  private async waitForPluginResult(
    plugin: AgentPlugin,
    session: AgentPluginSession,
  ): Promise<AgentPluginResult> {
    while (true) {
      const output = await plugin.getOutput(session);
      if (output) return output;

      const alive = await plugin.isAlive(session);
      if (!alive) {
        const finalOutput = await plugin.getOutput(session);
        if (finalOutput) return finalOutput;
        return { error: "Agent plugin ended without output" };
      }

      await delay(25);
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
