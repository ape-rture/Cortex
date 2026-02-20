import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Task } from "../../core/types/task-queue.js";
import { MarkdownTaskQueue } from "../../core/task-queue.js";
import {
  parseTelegramTaskRefs,
  processNextTelegramQueuedTask,
  processTelegramQueueBatch,
} from "./queue-worker.js";

function makeTelegramTask(
  partial: Partial<Task> = {},
): Omit<Task, "id" | "status" | "created_at" | "updated_at" | "capture_type"> & { capture_type?: Task["capture_type"] } {
  return {
    title: partial.title ?? "Queued Telegram task",
    description: partial.description,
    priority: partial.priority ?? "p2",
    source: partial.source ?? "telegram",
    capture_type: partial.capture_type ?? "task",
    assigned_to: partial.assigned_to,
    due_by: partial.due_by,
    context_refs: partial.context_refs,
    tags: partial.tags,
    result: partial.result,
  };
}

test("parseTelegramTaskRefs reads message refs", () => {
  const refs = parseTelegramTaskRefs({
    id: "task-1",
    title: "Test",
    status: "queued",
    priority: "p2",
    capture_type: "task",
    source: "telegram",
    created_at: "2026-02-15T10:00:00.000Z",
    updated_at: "2026-02-15T10:00:00.000Z",
    context_refs: ["telegram:-1001234567890:42"],
  });

  assert.deepEqual(refs, {
    chatId: "-1001234567890",
    messageId: "42",
  });
});

test("processNextTelegramQueuedTask processes highest-priority telegram item", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-telegram-worker-"));
  const queuePath = path.join(tempDir, "queue.md");
  const queue = new MarkdownTaskQueue(queuePath);

  const lowId = await queue.add(
    makeTelegramTask({
      title: "Low priority",
      priority: "p3",
      context_refs: ["telegram:7001:1"],
    }),
  );
  const highId = await queue.add(
    makeTelegramTask({
      title: "High priority",
      priority: "p0",
      context_refs: ["telegram:7001:2"],
    }),
  );

  const processed = await processNextTelegramQueuedTask({
    queue,
    executePrompt: async (prompt) => ({
      content: `handled: ${prompt}`,
      modelUsed: "test:model",
    }),
  });

  assert.equal(processed?.status, "done");
  assert.equal(processed?.taskId, highId);
  assert.equal(processed?.status === "done" ? processed.result.modelUsed : "", "test:model");
  assert.equal(processed?.refs?.chatId, "7001");
  assert.equal(processed?.refs?.messageId, "2");

  const all = await queue.list();
  const highTask = all.find((task) => task.id === highId);
  const lowTask = all.find((task) => task.id === lowId);
  assert.equal(highTask?.status, "done");
  assert.equal(lowTask?.status, "queued");
  assert.match(highTask?.result ?? "", /model=test:model/);
});

test("processTelegramQueueBatch processes multiple items up to maxTasks", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-telegram-worker-"));
  const queue = new MarkdownTaskQueue(path.join(tempDir, "queue.md"));

  await queue.add(
    makeTelegramTask({
      title: "one",
      priority: "p1",
      context_refs: ["telegram:7002:1"],
    }),
  );
  await queue.add(
    makeTelegramTask({
      title: "two",
      priority: "p2",
      context_refs: ["telegram:7002:2"],
    }),
  );
  await queue.add(
    makeTelegramTask({
      title: "three",
      priority: "p3",
      context_refs: ["telegram:7002:3"],
    }),
  );

  const outcomes = await processTelegramQueueBatch({
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
