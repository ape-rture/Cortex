import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MarkdownTaskQueue } from "./task-queue.js";
import {
  formatQueueSummary,
  listFailedSourceTasks,
  listFailedSlackTasks,
  retryFailedSourceTasks,
  retryFailedSlackTasks,
  retryQueueTaskById,
  summarizeQueue,
} from "./queue-admin.js";

test("summarizeQueue returns all + slack + telegram counts", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-queue-admin-"));
  const queue = new MarkdownTaskQueue(path.join(tempDir, "queue.md"));

  const slackTask = await queue.add({
    title: "Slack failed item",
    priority: "p1",
    source: "slack",
  });
  await queue.update(slackTask, "failed", "Boom");

  const cliTask = await queue.add({
    title: "CLI done item",
    priority: "p2",
    source: "cli",
  });
  await queue.update(cliTask, "done", "OK");

  const telegramTask = await queue.add({
    title: "Telegram blocked item",
    priority: "p2",
    source: "telegram",
  });
  await queue.update(telegramTask, "blocked", "Waiting for response");

  const summary = await summarizeQueue(queue);
  assert.equal(summary.total, 3);
  assert.equal(summary.all.failed, 1);
  assert.equal(summary.all.done, 1);
  assert.equal(summary.all.blocked, 1);
  assert.equal(summary.slack.failed, 1);
  assert.equal(summary.slack.done, 0);
  assert.equal(summary.telegram.blocked, 1);
  assert.equal(summary.telegram.failed, 0);

  const rendered = formatQueueSummary(summary);
  assert.match(rendered, /Total tasks: 3/);
  assert.match(rendered, /Slack: queued=0, in_progress=0, failed=1/);
  assert.match(rendered, /Telegram: queued=0, in_progress=0, failed=0, blocked=1/);
});

test("listFailedSlackTasks only returns failed slack tasks", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-queue-admin-"));
  const queue = new MarkdownTaskQueue(path.join(tempDir, "queue.md"));

  const slackTask = await queue.add({
    title: "Slack failed task",
    priority: "p0",
    source: "slack",
  });
  await queue.update(slackTask, "failed", "network timeout");

  const cliTask = await queue.add({
    title: "CLI failed task",
    priority: "p1",
    source: "cli",
  });
  await queue.update(cliTask, "failed", "cli issue");

  const output = await listFailedSlackTasks(queue);
  assert.match(output, /Slack failed task/);
  assert.match(output, /network timeout/);
  assert.doesNotMatch(output, /CLI failed task/);
});

test("listFailedSourceTasks can target telegram", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-queue-admin-"));
  const queue = new MarkdownTaskQueue(path.join(tempDir, "queue.md"));

  const telegramTask = await queue.add({
    title: "Telegram failed task",
    priority: "p2",
    source: "telegram",
  });
  await queue.update(telegramTask, "failed", "telegram issue");

  const slackTask = await queue.add({
    title: "Slack failed task",
    priority: "p1",
    source: "slack",
  });
  await queue.update(slackTask, "failed", "slack issue");

  const output = await listFailedSourceTasks(queue, { source: "telegram" });
  assert.match(output, /Failed Telegram Queue Tasks/);
  assert.match(output, /Telegram failed task/);
  assert.doesNotMatch(output, /Slack failed task/);
});

test("retryQueueTaskById requeues retryable task and rejects done", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-queue-admin-"));
  const queue = new MarkdownTaskQueue(path.join(tempDir, "queue.md"));

  const retryTask = await queue.add({
    title: "Retry me",
    priority: "p2",
    source: "slack",
  });
  await queue.update(retryTask, "failed", "oops");

  const doneTask = await queue.add({
    title: "Done task",
    priority: "p3",
    source: "slack",
  });
  await queue.update(doneTask, "done", "done");

  const retryMsg = await retryQueueTaskById(queue, retryTask);
  assert.match(retryMsg, /Requeued/);

  const doneMsg = await retryQueueTaskById(queue, doneTask);
  assert.match(doneMsg, /only failed\/blocked\/cancelled/);

  const tasks = await queue.list();
  const retried = tasks.find((task) => task.id === retryTask);
  assert.equal(retried?.status, "queued");
  assert.match(retried?.result ?? "", /Retry requested at/);
});

test("retryFailedSlackTasks requeues failed slack tasks only", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-queue-admin-"));
  const queue = new MarkdownTaskQueue(path.join(tempDir, "queue.md"));

  const slackFailed = await queue.add({
    title: "Slack failed",
    priority: "p1",
    source: "slack",
  });
  await queue.update(slackFailed, "failed", "oops");

  const slackBlocked = await queue.add({
    title: "Slack blocked",
    priority: "p2",
    source: "slack",
  });
  await queue.update(slackBlocked, "blocked", "waiting");

  const cliFailed = await queue.add({
    title: "CLI failed",
    priority: "p1",
    source: "cli",
  });
  await queue.update(cliFailed, "failed", "oops");

  const msg = await retryFailedSlackTasks(queue);
  assert.match(msg, /Requeued 2 Slack task\(s\)/);

  const all = await queue.list();
  const slackFailedTask = all.find((task) => task.id === slackFailed);
  const slackBlockedTask = all.find((task) => task.id === slackBlocked);
  const cliFailedTask = all.find((task) => task.id === cliFailed);
  assert.equal(slackFailedTask?.status, "queued");
  assert.equal(slackBlockedTask?.status, "queued");
  assert.equal(cliFailedTask?.status, "failed");
});

test("retryFailedSourceTasks requeues telegram tasks only", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-queue-admin-"));
  const queue = new MarkdownTaskQueue(path.join(tempDir, "queue.md"));

  const telegramFailed = await queue.add({
    title: "Telegram failed",
    priority: "p2",
    source: "telegram",
  });
  await queue.update(telegramFailed, "failed", "oops");

  const slackFailed = await queue.add({
    title: "Slack failed",
    priority: "p1",
    source: "slack",
  });
  await queue.update(slackFailed, "failed", "oops");

  const msg = await retryFailedSourceTasks(queue, "telegram");
  assert.match(msg, /Requeued 1 Telegram task\(s\)/);

  const all = await queue.list();
  const telegramTask = all.find((task) => task.id === telegramFailed);
  const slackTask = all.find((task) => task.id === slackFailed);
  assert.equal(telegramTask?.status, "queued");
  assert.equal(slackTask?.status, "failed");
});
