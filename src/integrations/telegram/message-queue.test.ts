import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MarkdownTaskQueue } from "../../core/task-queue.js";
import { enqueueTelegramMessage, parseTelegramQueueMessage } from "./message-queue.js";

test("parseTelegramQueueMessage parses priority prefixes", () => {
  const p0 = parseTelegramQueueMessage("!! fix prod incident");
  assert.equal(p0.priority, "p0");
  assert.equal(p0.content, "fix prod incident");

  const p1 = parseTelegramQueueMessage("! follow up with partner");
  assert.equal(p1.priority, "p1");
  assert.equal(p1.content, "follow up with partner");

  const p3 = parseTelegramQueueMessage("[p3] trim backlog");
  assert.equal(p3.priority, "p3");
  assert.equal(p3.content, "trim backlog");
});

test("parseTelegramQueueMessage parses capture type prefixes", () => {
  const parsed = parseTelegramQueueMessage("#research explore this benchmark");
  assert.equal(parsed.captureType, "research");
  assert.equal(parsed.content, "explore this benchmark");
});

test("enqueueTelegramMessage stores metadata for queueing", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-telegram-queue-"));
  const queue = new MarkdownTaskQueue(path.join(tempDir, "queue.md"));

  const queued = await enqueueTelegramMessage(
    {
      chatId: "-1001234567890",
      messageId: 1234,
      userId: 99,
      text: "p1: investigate webhook retries",
    },
    queue,
  );

  assert.equal(queued.duplicate, false);
  assert.equal(queued.priority, "p1");

  const all = await queue.list();
  assert.equal(all.length, 1);
  assert.equal(all[0].source, "telegram");
  assert.equal(all[0].priority, "p1");
  assert.equal(all[0].capture_type, "task");
  assert.equal(all[0].assigned_to, "telegram:99");
  assert.ok(all[0].context_refs?.includes("telegram:-1001234567890:1234"));
  assert.ok(all[0].tags?.includes("telegram"));
  assert.ok(all[0].tags?.includes("chat:-1001234567890"));
  assert.ok(all[0].tags?.includes("user:99"));
});

test("enqueueTelegramMessage stores capture type tag when prefixed", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-telegram-queue-"));
  const queue = new MarkdownTaskQueue(path.join(tempDir, "queue.md"));

  await enqueueTelegramMessage(
    {
      chatId: "-1001234567890",
      messageId: 2222,
      userId: 55,
      text: "#feature add typed capture dashboard cards",
    },
    queue,
  );

  const all = await queue.list();
  assert.equal(all.length, 1);
  assert.ok(all[0].tags?.includes("capture_type:cortex_feature"));
  assert.equal(all[0].capture_type, "feature");
  assert.equal(all[0].title, "add typed capture dashboard cards");
});

test("enqueueTelegramMessage deduplicates repeated delivery", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-telegram-queue-"));
  const queue = new MarkdownTaskQueue(path.join(tempDir, "queue.md"));

  const first = await enqueueTelegramMessage(
    {
      chatId: "7001",
      messageId: "73",
      text: "capture this from telegram",
    },
    queue,
  );

  const second = await enqueueTelegramMessage(
    {
      chatId: "7001",
      messageId: "73",
      text: "capture this from telegram",
    },
    queue,
  );

  assert.equal(second.duplicate, true);
  assert.equal(second.taskId, first.taskId);
  assert.equal((await queue.list()).length, 1);
});
