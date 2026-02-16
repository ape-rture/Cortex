import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MarkdownTaskQueue } from "../../core/task-queue.js";
import { enqueueSlackMessage, parseSlackQueueMessage } from "./message-queue.js";

test("parseSlackQueueMessage parses priority prefixes", () => {
  const p0 = parseSlackQueueMessage("[p0] fix prod incident");
  assert.equal(p0.priority, "p0");
  assert.equal(p0.content, "fix prod incident");

  const p1 = parseSlackQueueMessage("! follow up with partner");
  assert.equal(p1.priority, "p1");
  assert.equal(p1.content, "follow up with partner");

  const withMention = parseSlackQueueMessage("<@U123> p3: trim backlog");
  assert.equal(withMention.priority, "p3");
  assert.equal(withMention.content, "trim backlog");
});

test("enqueueSlackMessage stores metadata for thread-aware queueing", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-slack-queue-"));
  const queue = new MarkdownTaskQueue(path.join(tempDir, "queue.md"));

  const queued = await enqueueSlackMessage(
    {
      channelId: "C1",
      messageTs: "1739500000.000100",
      threadTs: "1739499999.000001",
      userId: "U1",
      text: "p1: investigate webhook retries",
    },
    queue,
  );

  assert.equal(queued.duplicate, false);
  assert.equal(queued.priority, "p1");

  const all = await queue.list();
  assert.equal(all.length, 1);
  assert.equal(all[0].source, "slack");
  assert.equal(all[0].priority, "p1");
  assert.equal(all[0].assigned_to, "slack:U1");
  assert.ok(all[0].context_refs?.includes("slack:C1:1739500000.000100"));
  assert.ok(all[0].context_refs?.includes("slack-thread:C1:1739499999.000001"));
  assert.ok(all[0].tags?.includes("channel:C1"));
  assert.ok(all[0].tags?.includes("thread:1739499999.000001"));
});

test("enqueueSlackMessage deduplicates repeated delivery", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-slack-queue-"));
  const queue = new MarkdownTaskQueue(path.join(tempDir, "queue.md"));

  const first = await enqueueSlackMessage(
    {
      channelId: "C2",
      messageTs: "1739500000.000200",
      text: "capture this from slack",
    },
    queue,
  );

  const second = await enqueueSlackMessage(
    {
      channelId: "C2",
      messageTs: "1739500000.000200",
      text: "capture this from slack",
    },
    queue,
  );

  assert.equal(second.duplicate, true);
  assert.equal(second.taskId, first.taskId);
  assert.equal((await queue.list()).length, 1);
});
