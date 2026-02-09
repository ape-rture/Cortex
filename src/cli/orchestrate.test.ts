import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs, runOrchestrate } from "./orchestrate.js";
import type { OrchestratorConfig } from "../core/types/orchestrator.js";

function makeConfig(withCron: boolean): OrchestratorConfig {
  return {
    agents: {},
    triggers: withCron
      ? [{ type: "cron", schedule: "0 7 * * *", agents: [] }]
      : [{ type: "cli", agents: [] }],
    fame_threshold: 0.3,
    max_parallel_agents: 3,
    max_escalations_per_agent: 0,
    routing_config_path: "context/model-routing.json",
    agent_routing: {
      affinities: [],
      default_agent: "sales-watcher",
    },
  };
}

test("parseArgs handles trigger and cron flags", () => {
  const args = parseArgs([
    "--trigger=cron",
    "--schedule=0 7 * * *",
    "--cron",
    "--verbose",
    "--agents=sales-watcher,code-watcher",
  ]);

  assert.equal(args.triggerType, "cron");
  assert.equal(args.schedule, "0 7 * * *");
  assert.equal(args.runCronTriggers, true);
  assert.equal(args.verbose, true);
  assert.deepEqual(args.agents, ["sales-watcher", "code-watcher"]);
});

test("runOrchestrate reports when no cron triggers are configured", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-orch-cli-"));
  try {
    const configPath = path.join(root, "orchestrator.json");
    await fs.writeFile(configPath, JSON.stringify(makeConfig(false), null, 2), "utf8");

    const output = await runOrchestrate(["--cron"], { configPath });
    assert.equal(output, "No cron triggers configured.");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("runOrchestrate executes configured cron triggers", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-orch-cli-"));
  try {
    const configPath = path.join(root, "orchestrator.json");
    await fs.writeFile(configPath, JSON.stringify(makeConfig(true), null, 2), "utf8");

    const output = await runOrchestrate(["--cron"], { configPath });
    assert.ok(output.includes("# Orchestrator Cron Run"));
    assert.ok(output.includes("Cron triggers run: 1"));
    assert.ok(output.includes("0 7 * * *"));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
