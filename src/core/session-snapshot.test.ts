import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MarkdownSessionSnapshotStore } from "./session-snapshot.js";

test("MarkdownSessionSnapshotStore captures and loads", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-snap-"));
  const snapshotPath = path.join(tempDir, "snapshot.md");
  const store = new MarkdownSessionSnapshotStore(snapshotPath);

  await store.capture({
    agent: "codex",
    ended_at: "2026-02-02T10:00:00Z",
    branch: "codex/test",
    working_on: "Testing snapshot store",
    unfinished: ["Wire /gm snapshot"],
    next_steps: ["Implement gm snapshot"],
    open_questions: ["Where to store summaries?"],
    key_files: ["src/core/session-snapshot.ts"],
  });

  const loaded = await store.load();
  assert.ok(loaded);
  assert.equal(loaded?.agent, "codex");
  assert.equal(loaded?.working_on, "Testing snapshot store");
  assert.equal(loaded?.unfinished.length, 1);
});
