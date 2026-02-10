import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MarkdownTaskQueue } from "./task-queue.js";
import { InMemoryThreadScheduler } from "./thread-scheduler.js";

test("InMemoryThreadScheduler runs same-thread tasks serially", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-thread-scheduler-"));
  try {
    const queuePath = path.join(tempDir, "queue.md");
    const queue = new MarkdownTaskQueue(queuePath);
    const scheduler = new InMemoryThreadScheduler(queue);

    const id1 = await scheduler.enqueue("project:alpha", {
      title: "Alpha task 1",
      priority: "p1",
      source: "cli",
    });
    await scheduler.enqueue("project:alpha", {
      title: "Alpha task 2",
      priority: "p1",
      source: "cli",
    });

    const first = await scheduler.nextForThread("project:alpha");
    assert.equal(first?.id, id1);

    const blockedBySerial = await scheduler.nextForThread("project:alpha");
    assert.equal(blockedBySerial, undefined);

    await scheduler.update(id1, "done", "finished");
    const second = await scheduler.nextForThread("project:alpha");
    assert.equal(second?.title, "Alpha task 2");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("InMemoryThreadScheduler limits cross-thread parallelism", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-thread-scheduler-"));
  try {
    const queuePath = path.join(tempDir, "queue.md");
    const queue = new MarkdownTaskQueue(queuePath);
    const scheduler = new InMemoryThreadScheduler(queue, {
      max_parallel_threads: 1,
    });

    await scheduler.enqueue("project:alpha", {
      title: "Alpha high priority",
      priority: "p0",
      source: "cli",
    });
    await scheduler.enqueue("project:beta", {
      title: "Beta task",
      priority: "p1",
      source: "cli",
    });

    const first = await scheduler.next();
    assert.equal(first?.title, "Alpha high priority");

    const blockedByParallelLimit = await scheduler.next();
    assert.equal(blockedByParallelLimit, undefined);

    if (!first) throw new Error("Expected first task");
    await scheduler.update(first.id, "done", "finished");

    const second = await scheduler.next();
    assert.equal(second?.title, "Beta task");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("InMemoryThreadScheduler rejects enqueue past max queue depth", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-thread-scheduler-"));
  try {
    const queuePath = path.join(tempDir, "queue.md");
    const queue = new MarkdownTaskQueue(queuePath);
    const scheduler = new InMemoryThreadScheduler(queue, {
      max_queue_depth_per_thread: 1,
    });

    await scheduler.enqueue("project:alpha", {
      title: "Alpha task 1",
      priority: "p2",
      source: "cli",
    });

    await assert.rejects(
      async () => {
        await scheduler.enqueue("project:alpha", {
          title: "Alpha task 2",
          priority: "p2",
          source: "cli",
        });
      },
      /queue depth exceeded/i,
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("InMemoryThreadScheduler adopts pre-existing queued tasks into default thread", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-thread-scheduler-"));
  try {
    const queuePath = path.join(tempDir, "queue.md");
    const queue = new MarkdownTaskQueue(queuePath);
    const id = await queue.add({
      title: "Legacy queued task",
      priority: "p2",
      source: "cli",
    });

    const scheduler = new InMemoryThreadScheduler(queue);
    const next = await scheduler.next();
    assert.equal(next?.id, id);

    const status = await scheduler.threadStatus("default");
    assert.equal(status.in_progress, 1);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
