import { randomUUID } from "node:crypto";
import { executeClaudeCodeAgent } from "./claude-code-process.js";
import { executeCodexCliAgent } from "./codex-process.js";
import type { AgentOutput } from "./types/agent-output.js";
import type {
  AgentPlugin,
  AgentPluginContext,
  AgentPluginResult,
  AgentPluginSession,
  AgentSpawnConfig,
} from "./types/orchestrator.js";

interface SessionRecord {
  alive: boolean;
  output: AgentPluginResult | null;
  abortController: AbortController;
}

function nowIso(): string {
  return new Date().toISOString();
}

function summarizeMessage(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "Agent completed";
  const first = trimmed.split(/\r?\n/)[0] ?? trimmed;
  return first.slice(0, 200);
}

function makeCodexOutput(config: AgentSpawnConfig, lastMessage: string, exitCode: number): AgentOutput {
  const errors = exitCode === 0
    ? []
    : [`Codex CLI exited with code ${exitCode}`, ...(lastMessage ? [lastMessage] : [])];

  const findings = lastMessage && exitCode === 0
    ? [{
      type: "insight" as const,
      summary: summarizeMessage(lastMessage),
      detail: lastMessage,
      urgency: "low" as const,
      confidence: 0.4,
      context_refs: [],
      requires_human: false,
    }]
    : [];

  return {
    agent: config.agent,
    timestamp: nowIso(),
    findings,
    memory_updates: [],
    errors,
  };
}

function resolveCodexModel(model: string): string | undefined {
  if (!model) return undefined;
  const [, suffix] = model.split(":", 2);
  return suffix?.trim() || model;
}

abstract class BasePlugin implements AgentPlugin {
  private readonly sessions = new Map<string, SessionRecord>();

  constructor(readonly id: string) {}

  async isAlive(session: AgentPluginSession): Promise<boolean> {
    return this.sessions.get(session.id)?.alive ?? false;
  }

  async getOutput(session: AgentPluginSession): Promise<AgentPluginResult | null> {
    return this.sessions.get(session.id)?.output ?? null;
  }

  async send(_session: AgentPluginSession, _message: string): Promise<void> {
    // Best effort noop for now. Plugins can override if they support live interaction.
  }

  async kill(session: AgentPluginSession): Promise<void> {
    const record = this.sessions.get(session.id);
    if (!record) return;

    record.abortController.abort();
    if (!record.output) {
      record.output = { error: "Agent session killed" };
    }
    record.alive = false;
  }

  protected async startSession(
    config: AgentSpawnConfig,
    context: AgentPluginContext,
    run: (abortSignal: AbortSignal) => Promise<AgentPluginResult>,
  ): Promise<AgentPluginSession> {
    const session: AgentPluginSession = {
      id: randomUUID(),
      agent: config.agent,
      execution_type: config.execution_type,
      started_at: nowIso(),
    };

    const record: SessionRecord = {
      alive: true,
      output: null,
      abortController: new AbortController(),
    };

    this.sessions.set(session.id, record);

    void (async () => {
      try {
        record.output = await run(record.abortController.signal);
      } catch (error) {
        record.output = {
          error: error instanceof Error ? error.message : String(error),
        };
      } finally {
        record.alive = false;
      }
    })();

    return session;
  }

  abstract spawn(config: AgentSpawnConfig, context: AgentPluginContext): Promise<AgentPluginSession>;
}

export class LocalScriptAgentPlugin extends BasePlugin {
  constructor(
    private readonly executeLocal: (config: AgentSpawnConfig, context: AgentPluginContext) => Promise<AgentOutput>,
  ) {
    super("local-script");
  }

  async spawn(config: AgentSpawnConfig, context: AgentPluginContext): Promise<AgentPluginSession> {
    return await this.startSession(config, context, async () => ({
      output: await this.executeLocal(config, context),
    }));
  }
}

export class ClaudeSdkAgentPlugin extends BasePlugin {
  constructor(
    private readonly onEvent?: (event: Record<string, unknown>) => void,
    private readonly executeImpl: typeof executeClaudeCodeAgent = executeClaudeCodeAgent,
  ) {
    super("claude-sdk");
  }

  async spawn(config: AgentSpawnConfig, context: AgentPluginContext): Promise<AgentPluginSession> {
    const basePath = context.workingDir ?? context.basePath;

    return await this.startSession(config, context, async (abortSignal) => ({
      output: await this.executeImpl(
        config,
        {
          cycle_id: context.cycle_id,
          trigger: context.trigger,
          basePath,
          task_prompt: context.task_prompt,
        },
        {
          abortSignal,
          onEvent: this.onEvent,
        },
      ),
    }));
  }
}

export class CodexCliAgentPlugin extends BasePlugin {
  constructor(
    private readonly onEvent?: (event: Record<string, unknown>) => void,
    private readonly executeImpl: typeof executeCodexCliAgent = executeCodexCliAgent,
  ) {
    super("codex-cli");
  }

  async spawn(config: AgentSpawnConfig, context: AgentPluginContext): Promise<AgentPluginSession> {
    const promptFromPayload = typeof context.trigger.payload?.prompt === "string"
      ? context.trigger.payload.prompt
      : "";

    const prompt = context.task_prompt?.trim() || promptFromPayload || [
      `Agent: ${config.agent}`,
      `Cycle: ${context.cycle_id}`,
      "Perform the assigned task and report completion.",
    ].join("\n");

    const workingDir = context.workingDir ?? context.basePath;
    const model = resolveCodexModel(config.model);
    const timeoutMs = config.permissions.timeout_ms;

    return await this.startSession(config, context, async (abortSignal) => {
      const result = await this.executeImpl(
        {
          prompt,
          workingDir,
          model,
          timeoutMs,
          sandboxMode: "workspace-write",
          abortSignal,
        },
        (event) => {
          this.onEvent?.(event as Record<string, unknown>);
        },
      );

      return {
        output: makeCodexOutput(config, result.lastMessage, result.exitCode),
      };
    });
  }
}

export function createDefaultPlugins(
  executeLocal: (config: AgentSpawnConfig, context: AgentPluginContext) => Promise<AgentOutput>,
): Record<AgentSpawnConfig["execution_type"], AgentPlugin> {
  return {
    local_script: new LocalScriptAgentPlugin(executeLocal),
    claude_code: new ClaudeSdkAgentPlugin(),
    codex_cli: new CodexCliAgentPlugin(),
    claude_api: new LocalScriptAgentPlugin(async (config) => ({
      agent: config.agent,
      timestamp: nowIso(),
      findings: [],
      memory_updates: [],
      errors: ["claude_api plugin not implemented"],
    })),
    openai_api: new LocalScriptAgentPlugin(async (config) => ({
      agent: config.agent,
      timestamp: nowIso(),
      findings: [],
      memory_updates: [],
      errors: ["openai_api plugin not implemented"],
    })),
    mcp_tool: new LocalScriptAgentPlugin(async (config) => ({
      agent: config.agent,
      timestamp: nowIso(),
      findings: [],
      memory_updates: [],
      errors: ["mcp_tool plugin not implemented"],
    })),
  };
}
