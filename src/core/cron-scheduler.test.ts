import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CronScheduler } from "./cron-scheduler.js";
import type { OrchestratorConfig, Trigger } from "./types/orchestrator.js";

interface CapturedTask {
  readonly expression: string;
  readonly handler: () => void;
  stopped: boolean;
  destroyed: boolean;
}

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-cron-scheduler-"));
  try {
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function makeConfig(triggers: Trigger[]): OrchestratorConfig {
  return {
    agents: {},
    triggers,
    fame_threshold: 0.3,
    max_parallel_agents: 2,
    max_escalations_per_agent: 0,
    routing_config_path: "context/model-routing.json",
    agent_routing: {
      affinities: [],
      default_agent: "sales-watcher",
    },
  };
}

test("CronScheduler schedules cron triggers and runs orchestrator cycles", async () => {
  await withTempDir(async (dir) => {
    const configPath = path.join(dir, "orchestrator.json");
    await fs.writeFile(
      configPath,
      JSON.stringify(
        makeConfig([
          { type: "cron", schedule: "0 7 * * *", agents: ["sales-watcher"] },
          { type: "cli", agents: ["sales-watcher"] },
        ]),
        null,
        2,
      ),
      "utf8",
    );

    let reloadCalls = 0;
    const runCalls: Trigger[] = [];
    const orchestrator = {
      reloadConfig: async () => {
        reloadCalls++;
      },
      runCycle: async (trigger: Trigger) => {
        runCalls.push(trigger);
      },
    };

    const captured: CapturedTask[] = [];
    const cronApi = {
      validate: (expression: string) => expression === "0 7 * * *",
      schedule: (expression: string, handler: () => void) => {
        const task: CapturedTask = {
          expression,
          handler,
          stopped: false,
          destroyed: false,
        };
        captured.push(task);
        return {
          stop: () => {
            task.stopped = true;
          },
          destroy: () => {
            task.destroyed = true;
          },
        };
      },
    };

    const scheduler = new CronScheduler(orchestrator, configPath, { cronApi });
    const count = await scheduler.start();

    assert.equal(reloadCalls, 1);
    assert.equal(count, 1);
    assert.equal(captured.length, 1);
    assert.equal(captured[0]?.expression, "0 7 * * *");

    captured[0]?.handler();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(runCalls.length, 1);
    assert.equal(runCalls[0]?.type, "cron");

    scheduler.stop();
    assert.equal(captured[0]?.stopped, true);
    assert.equal(captured[0]?.destroyed, true);
  });
});

test("CronScheduler reports cycle errors through onError callback", async () => {
  await withTempDir(async (dir) => {
    const configPath = path.join(dir, "orchestrator.json");
    await fs.writeFile(
      configPath,
      JSON.stringify(
        makeConfig([{ type: "cron", schedule: "*/5 * * * *", agents: ["sales-watcher"] }]),
        null,
        2,
      ),
      "utf8",
    );

    const expected = new Error("boom");
    const orchestrator = {
      reloadConfig: async () => {},
      runCycle: async () => {
        throw expected;
      },
    };

    let capturedError: Error | undefined;
    let capturedTrigger: Trigger | undefined;
    let taskHandler: (() => void) | undefined;

    const cronApi = {
      validate: () => true,
      schedule: (_expression: string, handler: () => void) => {
        taskHandler = handler;
        return { stop: () => {} };
      },
    };

    const scheduler = new CronScheduler(orchestrator, configPath, {
      cronApi,
      onError: (error, trigger) => {
        capturedError = error;
        capturedTrigger = trigger;
      },
    });

    await scheduler.start();
    taskHandler?.();
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(capturedError, expected);
    assert.equal(capturedTrigger?.type, "cron");
  });
});
