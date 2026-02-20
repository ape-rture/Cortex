import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MarkdownTaskQueue } from "./task-queue.js";

test("MarkdownTaskQueue add/list/update/next/listByType", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-queue-"));
  const queuePath = path.join(tempDir, "queue.md");
  const queue = new MarkdownTaskQueue(queuePath);

  const id1 = await queue.add({
    title: "Task one",
    description: "First",
    priority: "p1",
    source: "cli",
  });

  const id2 = await queue.add({
    title: "Research task",
    description: "Second",
    priority: "p0",
    source: "telegram",
    capture_type: "research",
    source_url: "https://example.com/research",
    source_ref: "telegram:100:1",
    tags: ["capture_type:research"],
  });

  const all = await queue.list();
  assert.equal(all.length, 2);
  assert.equal(all.find((t) => t.id === id1)?.capture_type, "task");
  assert.equal(all.find((t) => t.id === id2)?.capture_type, "research");

  const next = await queue.next();
  assert.equal(next?.id, id2);

  const research = await queue.listByType("research");
  assert.equal(research.length, 1);
  assert.equal(research[0].id, id2);
  assert.equal(research[0].source_url, "https://example.com/research");

  await queue.update(id1, "done", "Finished");
  const done = await queue.list({ status: "done" });
  assert.equal(done.length, 1);
  assert.equal(done[0].result, "Finished");
});
