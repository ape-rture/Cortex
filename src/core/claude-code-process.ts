/**
 * Claude Code Agent Executor
 *
 * Runs agents via the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`).
 * Each agent gets an isolated session with scoped tools, a system prompt,
 * structured JSON output, and a budget cap.
 *
 * No subprocess spawning needed — the SDK handles process management.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AgentOutput, Finding, MemoryUpdate } from "./types/agent-output.js";
import type { AgentSpawnConfig, Trigger } from "./types/orchestrator.js";

// ---------------------------------------------------------------------
// JSON Schema for structured agent output
// ---------------------------------------------------------------------

/**
 * JSON Schema that matches our Finding + MemoryUpdate types.
 * The SDK enforces this via `outputFormat: { type: 'json_schema', schema }`.
 */
const AGENT_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  required: ["findings", "memory_updates", "errors"],
  additionalProperties: false,
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        required: ["type", "summary", "urgency", "confidence", "context_refs", "requires_human"],
        additionalProperties: false,
        properties: {
          type: { type: "string", enum: ["alert", "suggestion", "insight", "action_item"] },
          summary: { type: "string", description: "One-line human-readable description" },
          detail: { type: "string", description: "Extended context" },
          urgency: { type: "string", enum: ["critical", "high", "medium", "low"] },
          confidence: { type: "number", minimum: 0, maximum: 1, description: "0.0-1.0 self-assessed confidence" },
          suggested_action: { type: "string", description: "What the user could do about this" },
          context_refs: { type: "array", items: { type: "string" }, description: "Markdown file paths this finding references" },
          requires_human: { type: "boolean", description: "If true, must surface to user" },
        },
      },
    },
    memory_updates: {
      type: "array",
      items: {
        type: "object",
        required: ["file", "operation", "content"],
        additionalProperties: false,
        properties: {
          file: { type: "string", description: "Relative path from project root" },
          operation: { type: "string", enum: ["append", "update", "flag"] },
          content: { type: "string", description: "Content to write/append" },
        },
      },
    },
    errors: {
      type: "array",
      items: { type: "string" },
    },
  },
};

// ---------------------------------------------------------------------
// Model resolution
// ---------------------------------------------------------------------

/**
 * Convert a ModelRef ("provider:model_key") to a Claude SDK model value.
 */
function resolveModel(modelRef: string): string | undefined {
  const [provider, key] = modelRef.split(":", 2);

  if (provider === "anthropic") {
    switch (key) {
      case "sonnet": return "sonnet";
      case "haiku": return "haiku";
      case "opus": return "opus";
      default: return key;
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------
// Output normalization
// ---------------------------------------------------------------------

function normalizeFinding(raw: Record<string, unknown>): Finding {
  return {
    type: (raw.type as Finding["type"]) ?? "insight",
    summary: String(raw.summary ?? ""),
    detail: raw.detail ? String(raw.detail) : undefined,
    urgency: (raw.urgency as Finding["urgency"]) ?? "low",
    confidence: typeof raw.confidence === "number" ? raw.confidence : 0.5,
    suggested_action: raw.suggested_action ? String(raw.suggested_action) : undefined,
    context_refs: Array.isArray(raw.context_refs)
      ? raw.context_refs.map(String)
      : [],
    requires_human: typeof raw.requires_human === "boolean" ? raw.requires_human : false,
  };
}

function normalizeMemoryUpdate(raw: Record<string, unknown>): MemoryUpdate | null {
  if (!raw.file || !raw.operation || !raw.content) return null;
  return {
    file: String(raw.file),
    operation: raw.operation as MemoryUpdate["operation"],
    content: String(raw.content),
  };
}

/**
 * Extract JSON from text that may contain markdown code fences.
 */
function extractJsonFromText(text: string): string {
  const trimmed = text.trim();

  if (trimmed.startsWith("{")) {
    try { JSON.parse(trimmed); return trimmed; } catch { /* continue */ }
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    try { JSON.parse(candidate); return candidate; } catch { /* continue */ }
  }

  return trimmed;
}

/**
 * Parse structured output or text into AgentOutput.
 */
function parseAgentResult(
  agent: string,
  structuredOutput: unknown,
  resultText: string,
): AgentOutput {
  const timestamp = new Date().toISOString();

  // Try structured output first (from SDK's outputFormat enforcement)
  const data = structuredOutput ?? tryParseJson(resultText);

  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const rawFindings = Array.isArray(obj.findings) ? obj.findings : [];
    const rawUpdates = Array.isArray(obj.memory_updates) ? obj.memory_updates : [];
    const rawErrors = Array.isArray(obj.errors) ? obj.errors : [];

    return {
      agent,
      timestamp,
      findings: rawFindings
        .filter((f): f is Record<string, unknown> => f != null && typeof f === "object")
        .map(normalizeFinding),
      memory_updates: rawUpdates
        .filter((u): u is Record<string, unknown> => u != null && typeof u === "object")
        .map(normalizeMemoryUpdate)
        .filter((u): u is MemoryUpdate => u !== null),
      errors: rawErrors.map(String),
    };
  }

  // Fallback: wrap plain text as a single insight
  const trimmed = resultText.trim();
  if (!trimmed) {
    return { agent, timestamp, findings: [], memory_updates: [], errors: [] };
  }

  return {
    agent,
    timestamp,
    findings: [{
      type: "insight",
      summary: trimmed.split("\n")[0].slice(0, 200),
      detail: trimmed,
      urgency: "low",
      confidence: 0.3,
      context_refs: [],
      requires_human: false,
    }],
    memory_updates: [],
    errors: [],
  };
}

function tryParseJson(text: string): unknown {
  const clean = extractJsonFromText(text);
  try { return JSON.parse(clean); } catch { return undefined; }
}

// ---------------------------------------------------------------------
// High-level execution
// ---------------------------------------------------------------------

/**
 * Execute a Claude Code agent via the Agent SDK.
 *
 * Creates an isolated session with:
 * - Custom system prompt (from prompt_path)
 * - Scoped tools (from allowed_tools config)
 * - Structured JSON output (enforced by JSON schema)
 * - Budget cap ($0.50 default)
 * - Turn limit (from max_turns config)
 */
export async function executeClaudeCodeAgent(
  config: AgentSpawnConfig,
  context: { cycle_id: string; trigger: Trigger; basePath: string },
): Promise<AgentOutput> {
  // Load agent system prompt
  let agentPrompt: string;
  try {
    agentPrompt = await fs.readFile(
      path.resolve(context.basePath, config.prompt_path),
      "utf8",
    );
  } catch {
    throw new Error(`Failed to load agent prompt from ${config.prompt_path}`);
  }

  // Build task prompt
  const taskPrompt = [
    `TASK: Run analysis as the "${config.agent}" agent.`,
    "",
    `Cycle ID: ${context.cycle_id}`,
    `Trigger: ${context.trigger.type}${context.trigger.schedule ? ` (${context.trigger.schedule})` : ""}`,
    "",
    "Follow your system prompt instructions step by step.",
    "Read the relevant files, analyze them, and produce your findings.",
  ].join("\n");

  // Resolve model
  const model = resolveModel(config.model);

  // Build tool list
  const tools = config.allowed_tools?.length
    ? [...config.allowed_tools]
    : ["Read", "Glob", "Grep"];

  // AbortController for clean cancellation on timeout
  const abortController = new AbortController();
  const timeoutMs = config.permissions.timeout_ms || 180_000;
  const timer = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const q = query({
      prompt: taskPrompt,
      options: {
        systemPrompt: agentPrompt,
        model: model ?? "sonnet",
        tools,
        allowedTools: tools,
        maxTurns: config.max_turns ?? 6,
        maxBudgetUsd: config.max_budget_usd ?? 5.00,
        cwd: context.basePath,
        persistSession: false,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        abortController,
        outputFormat: {
          type: "json_schema",
          schema: AGENT_OUTPUT_SCHEMA,
        },
      },
    });

    // Consume the async generator, capturing assistant text along the way.
    // If the agent hits max_turns before producing structured output, we
    // salvage observations from these intermediate messages.
    let resultMessage: SDKResultMessage | undefined;
    const assistantChunks: string[] = [];

    for await (const message of q) {
      if (message.type === "result") {
        resultMessage = message as SDKResultMessage;
        break;
      }

      // Capture assistant text blocks for potential salvage
      const msgAny = message as Record<string, unknown>;
      if (msgAny.type === "assistant" && Array.isArray(msgAny.content)) {
        for (const block of msgAny.content as Array<Record<string, unknown>>) {
          if (block.type === "text" && typeof block.text === "string") {
            assistantChunks.push(block.text);
          }
        }
      }
    }

    if (!resultMessage) {
      return {
        agent: config.agent,
        timestamp: new Date().toISOString(),
        findings: [],
        memory_updates: [],
        errors: ["No result message received from Claude Code SDK"],
      };
    }

    // Parse result — both success and error subtypes may have structured output
    const resultAny = resultMessage as {
      subtype: string;
      is_error: boolean;
      result?: string;
      structured_output?: unknown;
      errors?: string[];
      total_cost_usd?: number;
      num_turns?: number;
    };

    let output = parseAgentResult(
      config.agent,
      resultAny.structured_output,
      resultAny.result ?? "",
    );

    // Handle max_turns: salvage partial results from intermediate text
    if (resultAny.subtype === "error_max_turns" && output.findings.length === 0) {
      const accumulatedText = assistantChunks.join("\n").trim();

      if (accumulatedText) {
        // Try to parse JSON from accumulated assistant text
        const salvaged = parseAgentResult(config.agent, null, accumulatedText);

        if (salvaged.findings.length > 0) {
          output = salvaged;
        } else {
          // Wrap raw observations as a single insight
          output = {
            ...output,
            findings: [{
              type: "insight" as const,
              summary: `Partial analysis (hit turn limit): ${accumulatedText.split("\n")[0].slice(0, 150)}`,
              detail: accumulatedText.slice(0, 3000),
              urgency: "low" as const,
              confidence: 0.3,
              context_refs: [],
              requires_human: false,
            }],
          };
        }
      }

      return {
        ...output,
        escalation_needed: true,
        escalation_reason: `Agent used all ${resultAny.num_turns ?? config.max_turns} turns without producing structured output. Consider increasing max_turns.`,
        errors: [
          ...output.errors,
          `Agent ended with: ${resultAny.subtype}`,
          ...(resultAny.errors ?? []),
        ],
      };
    }

    // Append SDK-level errors for other non-success subtypes
    if (resultAny.subtype !== "success") {
      return {
        ...output,
        errors: [
          ...output.errors,
          `Agent ended with: ${resultAny.subtype}`,
          ...(resultAny.errors ?? []),
        ],
      };
    }

    return output;
  } catch (err) {
    if (abortController.signal.aborted) {
      throw new Error(`Claude Code agent "${config.agent}" timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
