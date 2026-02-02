import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MarkdownTaskQueue } from "./task-queue.ts";

test("MarkdownTaskQueue add/list/update/next", async () => {
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
    title: "Task two",
    description: "Second",
    priority: "p0",
    source: "cli",
  });

  const all = await queue.list();
  assert.equal(all.length, 2);

  const next = await queue.next();
  assert.equal(next?.id, id2);

  await queue.update(id1, "done", "Finished");
  const done = await queue.list({ status: "done" });
  assert.equal(done.length, 1);
  assert.equal(done[0].result, "Finished");
});
