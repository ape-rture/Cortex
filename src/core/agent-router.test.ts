import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ConfigAgentRouter } from "./agent-router.js";
import type { OrchestratorConfig } from "./types/orchestrator.js";

function makeConfig(): OrchestratorConfig {
  return {
    agents: {},
    triggers: [],
    fame_threshold: 0.3,
    max_parallel_agents: 4,
    max_escalations_per_agent: 1,
    routing_config_path: "context/model-routing.json",
    agent_routing: {
      affinities: [
        {
          agent: "sales-watcher",
          task_types: ["research_analysis"],
          priority: 5,
          context_match: "contacts/**",
        },
        {
          agent: "content-scanner",
          task_types: ["content_drafting"],
          priority: 4,
        },
        {
          agent: "triage-agent",
          task_types: ["classification", "complex_reasoning"],
          priority: 2,
          context_match: "actions/**",
        },
      ],
      default_agent: "sales-watcher",
      user_directives: {
        "/sales": "sales-watcher",
        "/content": "content-scanner",
      },
    },
  };
}

test("ConfigAgentRouter prefers user directive prefixes", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-agent-router-"));
  try {
    const configPath = path.join(tempDir, "orchestrator.json");
    await fs.writeFile(configPath, JSON.stringify(makeConfig(), null, 2), "utf8");
    const router = new ConfigAgentRouter(configPath);

    const result = await router.resolve({
      prompt: "check status",
      user_directive: "/content draft launch thread",
    });

    assert.equal(result.agent, "content-scanner");
    assert.equal(result.reason, "user_directive");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("ConfigAgentRouter uses context glob match before task affinity", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-agent-router-"));
  try {
    const configPath = path.join(tempDir, "orchestrator.json");
    await fs.writeFile(configPath, JSON.stringify(makeConfig(), null, 2), "utf8");
    const router = new ConfigAgentRouter(configPath);

    const result = await router.resolve({
      prompt: "write a post",
      task_type: "content_drafting",
      touches_files: ["contacts/acme.md"],
    });

    assert.equal(result.agent, "sales-watcher");
    assert.equal(result.reason, "context_match");
    assert.equal(result.matched_affinity?.agent, "sales-watcher");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("ConfigAgentRouter uses task affinity when no directive/context match", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-agent-router-"));
  try {
    const configPath = path.join(tempDir, "orchestrator.json");
    await fs.writeFile(configPath, JSON.stringify(makeConfig(), null, 2), "utf8");
    const router = new ConfigAgentRouter(configPath);

    const result = await router.resolve({
      prompt: "Draft a thread from this podcast transcript",
      task_type: "content_drafting",
    });

    assert.equal(result.agent, "content-scanner");
    assert.equal(result.reason, "task_affinity");
    assert.equal(result.matched_affinity?.agent, "content-scanner");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("ConfigAgentRouter falls back to default agent", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-agent-router-"));
  try {
    const configPath = path.join(tempDir, "orchestrator.json");
    await fs.writeFile(configPath, JSON.stringify(makeConfig(), null, 2), "utf8");
    const router = new ConfigAgentRouter(configPath);

    const result = await router.resolve({
      prompt: "unknown request",
      task_type: "bulk_ops",
    });

    assert.equal(result.agent, "sales-watcher");
    assert.equal(result.reason, "default");
    assert.equal(result.matched_affinity, undefined);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
