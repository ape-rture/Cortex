import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Task } from "../../core/types/task-queue.js";
import { MarkdownTaskQueue } from "../../core/task-queue.js";
import {
  parseSlackTaskRefs,
  processNextSlackQueuedTask,
  processSlackQueueBatch,
} from "./queue-worker.js";

function makeSlackTask(
  partial: Partial<Task> = {},
): Omit<Task, "id" | "status" | "created_at" | "updated_at" | "capture_type"> & { capture_type?: Task["capture_type"] } {
  return {
    title: partial.title ?? "Queued Slack task",
    description: partial.description,
    priority: partial.priority ?? "p2",
    source: partial.source ?? "slack",
    capture_type: partial.capture_type ?? "task",
    assigned_to: partial.assigned_to,
    due_by: partial.due_by,
    context_refs: partial.context_refs,
    tags: partial.tags,
    result: partial.result,
  };
}

test("parseSlackTaskRefs reads message + thread refs", () => {
  const refs = parseSlackTaskRefs({
    id: "task-1",
    title: "Test",
    status: "queued",
    priority: "p2",
    capture_type: "task",
    source: "slack",
    created_at: "2026-02-15T10:00:00.000Z",
    updated_at: "2026-02-15T10:00:00.000Z",
    context_refs: ["slack:C123:1739500000.000200", "slack-thread:C123:1739499999.000100"],
  });

  assert.deepEqual(refs, {
    channelId: "C123",
    messageTs: "1739500000.000200",
    threadTs: "1739499999.000100",
  });
});

test("processNextSlackQueuedTask processes highest-priority slack item", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-slack-worker-"));
  const queuePath = path.join(tempDir, "queue.md");
  const queue = new MarkdownTaskQueue(queuePath);

  const lowId = await queue.add(
    makeSlackTask({
      title: "Low priority",
      priority: "p3",
      context_refs: ["slack:C1:1.0001"],
    }),
  );
  const highId = await queue.add(
    makeSlackTask({
      title: "High priority",
      priority: "p0",
      context_refs: ["slack:C1:1.0002", "slack-thread:C1:1.0002"],
    }),
  );

  const processed = await processNextSlackQueuedTask({
    queue,
    executePrompt: async (prompt) => ({
      content: `handled: ${prompt}`,
      modelUsed: "test:model",
    }),
  });

  assert.equal(processed?.status, "done");
  assert.equal(processed?.taskId, highId);
  assert.equal(processed?.status === "done" ? processed.result.modelUsed : "", "test:model");
  assert.equal(processed?.refs?.channelId, "C1");
  assert.equal(processed?.refs?.threadTs, "1.0002");

  const all = await queue.list();
  const highTask = all.find((task) => task.id === highId);
  const lowTask = all.find((task) => task.id === lowId);
  assert.equal(highTask?.status, "done");
  assert.equal(lowTask?.status, "queued");
  assert.match(highTask?.result ?? "", /model=test:model/);
});

test("processNextSlackQueuedTask ignores non-slack queued tasks", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-slack-worker-"));
  const queue = new MarkdownTaskQueue(path.join(tempDir, "queue.md"));

  await queue.add(
    makeSlackTask({
      source: "cli",
      title: "CLI task",
    }),
  );

  const processed = await processNextSlackQueuedTask({
    queue,
    executePrompt: async () => ({ content: "ok", modelUsed: "test:model" }),
  });

  assert.equal(processed, null);
  const all = await queue.list();
  assert.equal(all[0].status, "queued");
});

test("processNextSlackQueuedTask marks task failed when prompt execution throws", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-slack-worker-"));
  const queue = new MarkdownTaskQueue(path.join(tempDir, "queue.md"));

  const taskId = await queue.add(
    makeSlackTask({
      title: "Will fail",
      context_refs: ["slack:C1:1.0009"],
    }),
  );

  const processed = await processNextSlackQueuedTask({
    queue,
    executePrompt: async () => {
      throw new Error("simulated failure");
    },
  });

  assert.equal(processed?.status, "failed");
  assert.match(processed?.status === "failed" ? processed.error : "", /simulated failure/);
  const all = await queue.list();
  const task = all.find((item) => item.id === taskId);
  assert.equal(task?.status, "failed");
  assert.match(task?.result ?? "", /simulated failure/);
});

test("processSlackQueueBatch processes multiple items up to maxTasks", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-slack-worker-"));
  const queue = new MarkdownTaskQueue(path.join(tempDir, "queue.md"));

  await queue.add(
    makeSlackTask({
      title: "one",
      priority: "p1",
      context_refs: ["slack:C2:1.1"],
    }),
  );
  await queue.add(
    makeSlackTask({
      title: "two",
      priority: "p2",
      context_refs: ["slack:C2:1.2"],
    }),
  );
  await queue.add(
    makeSlackTask({
      title: "three",
      priority: "p3",
      context_refs: ["slack:C2:1.3"],
    }),
  );

  const outcomes = await processSlackQueueBatch({
    queue,
    maxTasks: 2,
    executePrompt: async (prompt) => ({
      content: `ok:${prompt}`,
      modelUsed: "test:model",
    }),
  });

  assert.equal(outcomes.length, 2);
  assert.ok(outcomes.every((item) => item.status === "done"));

  const all = await queue.list();
  const doneCount = all.filter((task) => task.status === "done").length;
  const queuedCount = all.filter((task) => task.status === "queued").length;
  assert.equal(doneCount, 2);
  assert.equal(queuedCount, 1);
});
