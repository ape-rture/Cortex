import { test } from "node:test";
import assert from "node:assert/strict";
import {
  executeClaudeCodeAgent,
  extractJsonFromText,
  normalizeFinding,
  parseAgentResult,
} from "./claude-code-process.js";
import type { AgentSpawnConfig, Trigger } from "./types/orchestrator.js";
import type { ClaudeCodeProcessDeps } from "./claude-code-process.js";

function makeConfig(): AgentSpawnConfig {
  return {
    agent: "project-analyst",
    prompt_path: "src/agents/prompts/project-analyst.md",
    execution_type: "claude_code",
    model: "anthropic:haiku",
    max_turns: 4,
    max_budget_usd: 1,
    allowed_tools: ["Read", "Glob", "Grep"],
    permissions: {
      agent: "project-analyst",
      can_read: ["**"],
      can_write: [],
      can_call_apis: [],
      can_send_messages: false,
      requires_human_approval: [],
      max_tokens: 4096,
      model: "anthropic:haiku",
      timeout_ms: 1000,
    },
  };
}

function makeContext(): { cycle_id: string; trigger: Trigger; basePath: string } {
  return {
    cycle_id: "cycle-1",
    trigger: { type: "cli", agents: ["project-analyst"] },
    basePath: process.cwd(),
  };
}

function makeQuery(
  messages: readonly Record<string, unknown>[],
): NonNullable<ClaudeCodeProcessDeps["queryImpl"]> {
  return (_params) => {
    async function* run(): AsyncGenerator<Record<string, unknown>> {
      for (const message of messages) {
        yield message;
      }
    }
    return run();
  };
}

test("extractJsonFromText pulls JSON from fenced blocks", () => {
  const text = "analysis\n```json\n{\"x\":1}\n```\nnotes";
  assert.equal(extractJsonFromText(text), "{\"x\":1}");
});

test("normalizeFinding applies defaults for missing optional fields", () => {
  const finding = normalizeFinding({
    summary: "Need follow-up",
    confidence: "not-a-number",
  });

  assert.equal(finding.type, "insight");
  assert.equal(finding.urgency, "low");
  assert.equal(finding.confidence, 0.5);
  assert.deepEqual(finding.context_refs, []);
  assert.equal(finding.requires_human, false);
});

test("parseAgentResult maps structured output into AgentOutput", () => {
  const output = parseAgentResult(
    "agent-a",
    {
      findings: [
        {
          type: "alert",
          summary: "Escalate this",
          urgency: "high",
          confidence: 0.9,
          context_refs: ["actions/queue.md"],
          requires_human: true,
        },
      ],
      memory_updates: [
        {
          file: "actions/queue.md",
          operation: "append",
          content: "- [ ] Follow up",
        },
      ],
      errors: [],
    },
    "",
  );

  assert.equal(output.agent, "agent-a");
  assert.equal(output.findings.length, 1);
  assert.equal(output.memory_updates.length, 1);
  assert.equal(output.errors.length, 0);
});

test("executeClaudeCodeAgent handles success subtype with structured output", async () => {
  const output = await executeClaudeCodeAgent(makeConfig(), makeContext(), {
    readFileImpl: async (_filePath, _encoding) => "system prompt",
    queryImpl: makeQuery([
      {
        type: "result",
        subtype: "success",
        is_error: false,
        structured_output: {
          findings: [
            {
              type: "insight",
              summary: "All good",
              urgency: "low",
              confidence: 0.8,
              context_refs: [],
              requires_human: false,
            },
          ],
          memory_updates: [],
          errors: [],
        },
        result: "",
      },
    ]),
  });

  assert.equal(output.findings.length, 1);
  assert.equal(output.findings[0]?.summary, "All good");
  assert.equal(output.errors.length, 0);
});

test("executeClaudeCodeAgent appends SDK errors for non-success subtype", async () => {
  const output = await executeClaudeCodeAgent(makeConfig(), makeContext(), {
    readFileImpl: async (_filePath, _encoding) => "system prompt",
    queryImpl: makeQuery([
      {
        type: "result",
        subtype: "error_permission_denied",
        is_error: true,
        structured_output: {
          findings: [],
          memory_updates: [],
          errors: ["agent-level issue"],
        },
        result: "",
        errors: ["sdk permission denied"],
      },
    ]),
  });

  assert.ok(output.errors.includes("agent-level issue"));
  assert.ok(output.errors.some((e) => e.includes("Agent ended with: error_permission_denied")));
  assert.ok(output.errors.includes("sdk permission denied"));
});

test("executeClaudeCodeAgent salvages assistant text on max_turns and marks escalation", async () => {
  const output = await executeClaudeCodeAgent(makeConfig(), makeContext(), {
    readFileImpl: async (_filePath, _encoding) => "system prompt",
    queryImpl: makeQuery([
      {
        type: "assistant",
        content: [
          {
            type: "text",
            text: "{\"findings\":[{\"type\":\"insight\",\"summary\":\"Partial result\",\"urgency\":\"medium\",\"confidence\":0.6,\"context_refs\":[],\"requires_human\":false}],\"memory_updates\":[],\"errors\":[]}",
          },
        ],
      },
      {
        type: "result",
        subtype: "error_max_turns",
        is_error: true,
        result: "",
        num_turns: 4,
        errors: ["hit max turns"],
      },
    ]),
  });

  assert.equal(output.escalation_needed, true);
  assert.ok(output.escalation_reason?.includes("increasing max_turns"));
  assert.equal(output.findings.length, 1);
  assert.equal(output.findings[0]?.summary, "Partial result");
  assert.ok(output.errors.some((e) => e.includes("error_max_turns")));
});
