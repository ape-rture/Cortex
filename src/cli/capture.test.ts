import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCapture } from "./capture.js";
import { MarkdownTaskQueue } from "../core/task-queue.js";
import type { RouteRequest, RouteResponse } from "../core/types/routing.js";

interface Fixture {
  readonly root: string;
  readonly queuePath: string;
}

async function createFixture(): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-capture-cli-"));
  const actionsDir = path.join(root, "actions");
  await fs.mkdir(actionsDir, { recursive: true });

  const queuePath = path.join(actionsDir, "queue.md");

  return {
    root,
    queuePath,
  };
}

function createRouterStub(content: string): { route: (request: RouteRequest) => Promise<RouteResponse> } {
  return {
    route: async () => ({
      content,
      model_used: "openai:test",
      used_fallback: false,
      usage: { input_tokens: 1, output_tokens: 1 },
      latency_ms: 1,
    }),
  };
}

test("runCapture routes explicit research/feature/seed commands to queue", async () => {
  const fixture = await createFixture();
  try {
    const queue = new MarkdownTaskQueue(fixture.queuePath);
    const options = {
      taskQueue: queue,
      router: createRouterStub('{"category":"research","confidence":0.9}'),
    };

    const researchResult = await runCapture(["research", "Investigate local embeddings"], options);
    assert.match(researchResult, /Captured research as queue task/);

    const featureResult = await runCapture(["feature", "Add \/capture dashboard"], options);
    assert.match(featureResult, /Captured cortex_feature as queue task/);

    const seedResult = await runCapture(["seed", "Ship a lightweight agent runner"], options);
    assert.match(seedResult, /Captured project_seed as queue task/);

    const all = await queue.list();
    assert.equal(all.length, 3);
    assert.equal(all.filter((task) => task.capture_type === "research").length, 1);
    assert.equal(all.filter((task) => task.capture_type === "feature").length, 1);
    assert.equal(all.filter((task) => task.capture_type === "seed").length, 1);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("runCapture auto-classifies untagged input and handles #tag fast path", async () => {
  const fixture = await createFixture();
  try {
    const options = {
      taskQueue: new MarkdownTaskQueue(fixture.queuePath),
      router: createRouterStub('{"category":"cortex_feature","confidence":0.88}'),
    };

    const auto = await runCapture(["Need", "a", "native", "sync", "for", "typed", "capture"], options);
    assert.match(auto, /Captured cortex_feature as queue task/);

    const tagged = await runCapture(["#action", "book", "dentist", "appointment"], {
      ...options,
      router: createRouterStub('{"category":"needs_review","confidence":0.1}'),
    });
    assert.match(tagged, /Captured action_item as queue task/);

    const all = await options.taskQueue.list();
    const action = all.find((task) => task.tags?.includes("capture_type:action_item"));
    assert.ok(action);
    assert.equal(action?.capture_type, "task");
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("runCapture supports list and inbox views", async () => {
  const fixture = await createFixture();
  try {
    const queue = new MarkdownTaskQueue(fixture.queuePath);
    await queue.add({
      title: "Telegram capture one",
      priority: "p2",
      source: "telegram",
      capture_type: "research",
      context_refs: ["telegram:100:1"],
      tags: ["capture_type:research"],
    });
    await queue.add({
      title: "Slack capture two",
      priority: "p1",
      source: "slack",
      capture_type: "feature",
      context_refs: ["slack:C1:22"],
      tags: ["capture_type:cortex_feature"],
    });

    const options = {
      taskQueue: queue,
      router: createRouterStub('{"category":"research","confidence":0.9}'),
    };

    await runCapture(["research", "Trace capture parser"], options);

    const list = await runCapture(["list", "research"], options);
    assert.match(list, /Trace capture parser/);

    const inbox = await runCapture(["inbox"], options);
    assert.match(inbox, /Capture Inbox \(2\)/);
    assert.match(inbox, /Telegram capture one/);
    assert.match(inbox, /Slack capture two/);

    const overview = await runCapture(["list"], options);
    assert.match(overview, /# Capture Overview/);
    assert.match(overview, /research:/);
    assert.match(overview, /feature:/);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});
