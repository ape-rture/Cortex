import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CortexOrchestrator } from "./orchestrator.js";
import type { OrchestratorConfig } from "./types/orchestrator.js";
import type { AgentOutput } from "./types/agent-output.js";

function makeConfig(): OrchestratorConfig {
  return {
    agents: {
      "agent-one": {
        agent: "agent-one",
        prompt_path: "src/agents/prompts/agent-one.md",
        execution_type: "local_script",
        model: "local:script",
        permissions: {
          agent: "agent-one",
          can_read: ["**"],
          can_write: [],
          can_call_apis: [],
          can_send_messages: false,
          requires_human_approval: [],
          max_tokens: 0,
          model: "local:script",
          timeout_ms: 1000,
        },
      },
      "agent-two": {
        agent: "agent-two",
        prompt_path: "src/agents/prompts/agent-two.md",
        execution_type: "local_script",
        model: "local:script",
        permissions: {
          agent: "agent-two",
          can_read: ["**"],
          can_write: [],
          can_call_apis: [],
          can_send_messages: false,
          requires_human_approval: [],
          max_tokens: 0,
          model: "local:script",
          timeout_ms: 1000,
        },
      },
    },
    triggers: [],
    fame_threshold: 0.65,
    max_parallel_agents: 2,
    max_escalations_per_agent: 0,
    routing_config_path: "context/model-routing.json",
    agent_routing: {
      affinities: [],
      default_agent: "agent-one",
    },
  };
}

function basicOutput(agent: string): AgentOutput {
  return {
    agent,
    timestamp: new Date().toISOString(),
    findings: [],
    memory_updates: [],
    errors: [],
  };
}

test("CortexOrchestrator runs cycle, scores findings, and captures events", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-orch-"));
  try {
    const configPath = path.join(root, "orchestrator.json");
    await fs.writeFile(configPath, JSON.stringify(makeConfig(), null, 2), "utf8");

    const orchestrator = new CortexOrchestrator(configPath);

    orchestrator.runner.registerLocal("agent-one", async (context) => ({
      ...basicOutput(context.agent),
      findings: [
        {
          type: "alert",
          summary: "High priority item",
          urgency: "high",
          confidence: 0.9,
          suggested_action: "Do it now",
          context_refs: [],
          requires_human: false,
        },
      ],
    }));

    orchestrator.runner.registerLocal("agent-two", async (context) => ({
      ...basicOutput(context.agent),
      findings: [
        {
          type: "insight",
          summary: "Low priority item",
          urgency: "low",
          confidence: 0.9,
          context_refs: [],
          requires_human: false,
        },
      ],
      memory_updates: [
        {
          operation: "append",
          file: "contacts/restricted.md",
          content: "should be blocked",
        },
      ],
    }));

    const cycle = await orchestrator.runCycle({
      type: "cli",
      agents: ["*"],
    });

    assert.equal(cycle.agents_spawned.length, 2);
    assert.equal(cycle.agent_outputs.length, 2);
    assert.ok(cycle.events.length >= 4);
    assert.equal(cycle.scored_findings.length, 2);
    assert.equal(cycle.surfaced.length, 1);
    assert.equal(cycle.surfaced[0]?.finding.summary, "High priority item");
    assert.ok(cycle.errors.some((error) => error.includes("Permission denied")));

    const history = orchestrator.history(1);
    assert.equal(history.length, 1);
    assert.equal(history[0]?.cycle_id, cycle.cycle_id);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("CortexOrchestrator falls back to AgentRouter when trigger has no explicit agents", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-orch-router-"));
  try {
    const config: OrchestratorConfig = {
      ...makeConfig(),
      agent_routing: {
        affinities: [
          {
            agent: "agent-two",
            task_types: ["content_drafting"],
            priority: 10,
          },
        ],
        default_agent: "agent-one",
        user_directives: {
          "/content": "agent-two",
        },
      },
    };

    const configPath = path.join(root, "orchestrator.json");
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf8");

    const orchestrator = new CortexOrchestrator(configPath);
    orchestrator.runner.registerLocal("agent-one", async (context) => ({
      ...basicOutput(context.agent),
      findings: [
        {
          type: "insight",
          summary: "Default agent finding",
          urgency: "low",
          confidence: 0.9,
          context_refs: [],
          requires_human: false,
        },
      ],
    }));
    orchestrator.runner.registerLocal("agent-two", async (context) => ({
      ...basicOutput(context.agent),
      findings: [
        {
          type: "insight",
          summary: "Routed agent finding",
          urgency: "high",
          confidence: 0.9,
          context_refs: [],
          requires_human: false,
        },
      ],
    }));

    const cycle = await orchestrator.runCycle({
      type: "agent_request",
      payload: {
        user_directive: "/content draft this",
        prompt: "draft a post",
      },
    });

    assert.deepEqual(cycle.agents_spawned, ["agent-two"]);
    assert.equal(cycle.agent_outputs.length, 1);
    assert.equal(cycle.agent_outputs[0]?.agent, "agent-two");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
