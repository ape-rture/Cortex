import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ClaudeSdkAgentPlugin,
  CodexCliAgentPlugin,
  LocalScriptAgentPlugin,
} from "./agent-plugins.js";
import { AgentRunner } from "./agent-runner.js";
import type { AgentSpawnConfig, Trigger } from "./types/orchestrator.js";

function makePermissions(agent: string) {
  return {
    agent,
    can_read: ["**"],
    can_write: ["**"],
    can_call_apis: [],
    can_send_messages: false,
    requires_human_approval: [],
    max_tokens: 1000,
    model: "local:script",
    timeout_ms: 500,
  } as const;
}

function makeContext(): { cycle_id: string; trigger: Trigger; basePath: string; task_prompt: string } {
  return {
    cycle_id: "cycle-1",
    trigger: { type: "cli", payload: { prompt: "payload prompt" } },
    basePath: process.cwd(),
    task_prompt: "task prompt",
  };
}

test("LocalScriptAgentPlugin satisfies spawn/isAlive/getOutput/send/kill", async () => {
  const plugin = new LocalScriptAgentPlugin(async (config) => ({
    agent: config.agent,
    timestamp: new Date().toISOString(),
    findings: [],
    memory_updates: [],
    errors: [],
  }));

  const config: AgentSpawnConfig = {
    agent: "local-demo",
    prompt_path: "unused.md",
    execution_type: "local_script",
    model: "local:script",
    permissions: makePermissions("local-demo"),
  };

  const session = await plugin.spawn(config, makeContext());
  await plugin.send(session, "hello");

  const aliveEventually = await plugin.isAlive(session);
  assert.equal(typeof aliveEventually, "boolean");

  let output = await plugin.getOutput(session);
  if (!output) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    output = await plugin.getOutput(session);
  }

  assert.ok(output?.output);
  assert.equal(output?.output?.agent, "local-demo");

  await plugin.kill(session);
  assert.equal(await plugin.isAlive(session), false);
});

test("ClaudeSdkAgentPlugin returns output from execute implementation", async () => {
  const plugin = new ClaudeSdkAgentPlugin(
    undefined,
    async (config) => ({
      agent: config.agent,
      timestamp: new Date().toISOString(),
      findings: [],
      memory_updates: [],
      errors: [],
    }),
  );

  const config: AgentSpawnConfig = {
    agent: "claude-worker",
    prompt_path: "src/agents/prompts/worker.md",
    execution_type: "claude_code",
    model: "anthropic:sonnet",
    permissions: makePermissions("claude-worker"),
  };

  const session = await plugin.spawn(config, makeContext());
  let output = await plugin.getOutput(session);
  if (!output) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    output = await plugin.getOutput(session);
  }

  assert.ok(output?.output);
  assert.equal(output?.output?.agent, "claude-worker");
});

test("CodexCliAgentPlugin returns normalized AgentOutput", async () => {
  const plugin = new CodexCliAgentPlugin(
    undefined,
    async () => ({
      exitCode: 0,
      lastMessage: "Implemented the task",
      events: [],
      durationMs: 1,
    }),
  );

  const config: AgentSpawnConfig = {
    agent: "codex-worker",
    prompt_path: "unused.md",
    execution_type: "codex_cli",
    model: "openai:gpt-5",
    permissions: makePermissions("codex-worker"),
  };

  const session = await plugin.spawn(config, makeContext());
  let output = await plugin.getOutput(session);
  if (!output) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    output = await plugin.getOutput(session);
  }

  assert.ok(output?.output);
  assert.equal(output?.output?.agent, "codex-worker");
  assert.equal(output?.output?.findings.length, 1);
});

test("AgentRunner reports unknown plugin execution types", async () => {
  const runner = new AgentRunner();
  const config = {
    agent: "mystery",
    prompt_path: "unused.md",
    execution_type: "mystery_plugin",
    model: "local:script",
    permissions: makePermissions("mystery"),
  } as unknown as AgentSpawnConfig;

  const output = await runner.run(config, {
    agent: "mystery",
    cycle_id: "cycle-1",
    trigger: { type: "cli" },
    basePath: process.cwd(),
  });

  assert.ok(output.errors.some((entry) => entry.includes("Unknown execution type")));
});
