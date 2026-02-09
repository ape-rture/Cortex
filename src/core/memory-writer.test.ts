import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MemoryWriter } from "./memory-writer.js";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-memory-writer-"));
  try {
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("MemoryWriter appends content and creates missing directories", async () => {
  await withTempDir(async (dir) => {
    const writer = new MemoryWriter(dir);
    const result = await writer.applyUpdates([
      {
        operation: "append",
        file: "notes/demo.md",
        content: "First line",
      },
    ]);

    assert.equal(result.applied, 1);
    assert.equal(result.flagged, 0);
    assert.equal(result.errors.length, 0);

    const content = await fs.readFile(path.join(dir, "notes/demo.md"), "utf8");
    assert.equal(content, "First line\n");
  });
});

test("MemoryWriter updates matching markdown section in-place", async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, "context", "sample.md");
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "# Keep\nalpha\n\n## Replace\nold line\n\n## Tail\nomega\n", "utf8");

    const writer = new MemoryWriter(dir);
    await writer.applyUpdates([
      {
        operation: "update",
        file: "context/sample.md",
        content: "## Replace\nnew line\n",
      },
    ]);

    const updated = await fs.readFile(filePath, "utf8");
    assert.ok(updated.includes("## Replace\nnew line"));
    assert.ok(!updated.includes("old line"));
    assert.ok(updated.includes("## Tail\nomega"));
  });
});

test("MemoryWriter writes flags to actions/review-queue.md under base path", async () => {
  await withTempDir(async (dir) => {
    const writer = new MemoryWriter(dir);
    const result = await writer.applyUpdates([
      {
        operation: "flag",
        file: "contacts/acme.md",
        content: "Need human review for relationship update",
      },
    ]);

    assert.equal(result.applied, 0);
    assert.equal(result.flagged, 1);
    assert.equal(result.errors.length, 0);

    const reviewQueuePath = path.join(dir, "actions", "review-queue.md");
    const content = await fs.readFile(reviewQueuePath, "utf8");
    assert.ok(content.includes("Flagged"));
    assert.ok(content.includes("contacts/acme.md"));
  });
});
