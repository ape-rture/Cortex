import { test } from "node:test";
import assert from "node:assert/strict";
import { AgentRunner } from "./agent-runner.js";
import type { AgentSpawnConfig, Trigger } from "./types/orchestrator.js";
import type { AgentEvent } from "./types/events.js";

function makeConfig(agent: string, timeoutMs = 500): AgentSpawnConfig {
  return {
    agent,
    prompt_path: "unused.md",
    execution_type: "local_script",
    model: "local:script",
    permissions: {
      agent,
      can_read: [],
      can_write: [],
      can_call_apis: [],
      can_send_messages: false,
      requires_human_approval: [],
      max_tokens: 0,
      model: "local:script",
      timeout_ms: timeoutMs,
    },
  };
}

function makeContext(agent: string): {
  agent: string;
  cycle_id: string;
  trigger: Trigger;
  basePath: string;
} {
  return {
    agent,
    cycle_id: "cycle-1",
    trigger: { type: "cli", agents: [agent] },
    basePath: process.cwd(),
  };
}

test("AgentRunner executes registered local agents and emits lifecycle events", async () => {
  const events: AgentEvent[] = [];
  const runner = new AgentRunner((event) => events.push(event));

  runner.registerLocal("demo-agent", async (context) => ({
    agent: context.agent,
    timestamp: new Date().toISOString(),
    findings: [],
    memory_updates: [],
    errors: [],
  }));

  const output = await runner.run(makeConfig("demo-agent"), makeContext("demo-agent"));
  assert.equal(output.agent, "demo-agent");
  assert.equal(output.errors.length, 0);

  assert.equal(events.length, 2);
  assert.equal(events[0]?.type, "started");
  assert.equal(events[1]?.type, "completed");
});

test("AgentRunner returns an error output when agent times out", async () => {
  const runner = new AgentRunner();
  runner.registerLocal("slow-agent", async (context) => {
    await new Promise((resolve) => setTimeout(resolve, 25));
    return {
      agent: context.agent,
      timestamp: new Date().toISOString(),
      findings: [],
      memory_updates: [],
      errors: [],
    };
  });

  const output = await runner.run(makeConfig("slow-agent", 5), makeContext("slow-agent"));
  assert.equal(output.agent, "slow-agent");
  assert.equal(output.findings.length, 0);
  assert.ok(output.errors.some((error) => error.includes("timed out")));
});
