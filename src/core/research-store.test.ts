import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MarkdownResearchStore } from "./research-store.js";

async function createFixture(): Promise<{
  root: string;
  researchPath: string;
  store: MarkdownResearchStore;
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-research-store-"));
  const researchPath = path.join(root, "actions", "research-queue.md");
  const store = new MarkdownResearchStore({ researchPath });
  return { root, researchPath, store };
}

test("MarkdownResearchStore supports add/load/update/list flow", async () => {
  const fixture = await createFixture();
  try {
    const firstId = await fixture.store.add({
      title: "Investigate benchmark harness",
      description: "Collect external references and baseline numbers",
      sourceUrl: "https://example.com/harness",
      sourceRef: "telegram:-100:15",
      tags: ["capture_type:research", "benchmark"],
      status: "captured",
      source: "telegram",
      result: undefined,
    });

    assert.equal(firstId, "research-001");

    const secondId = await fixture.store.add({
      title: "Compare local vs cloud token costs",
      description: undefined,
      sourceUrl: undefined,
      sourceRef: undefined,
      tags: ["costs"],
      status: "captured",
      source: "cli",
      result: undefined,
    });
    assert.equal(secondId, "research-002");

    const loaded = await fixture.store.load();
    assert.equal(loaded.length, 2);
    assert.equal(loaded[0].source, "telegram");
    assert.equal(loaded[0].status, "captured");

    await fixture.store.updateStatus(firstId, "researching");
    await fixture.store.updateStatus(secondId, "done", "Summarized in weekly notes");

    const researching = await fixture.store.listByStatus("researching");
    assert.equal(researching.length, 1);
    assert.equal(researching[0].id, firstId);

    const done = await fixture.store.listByStatus("done");
    assert.equal(done.length, 1);
    assert.match(done[0].result ?? "", /weekly notes/);

    const markdown = await fs.readFile(fixture.researchPath, "utf8");
    assert.match(markdown, /## Captured/);
    assert.match(markdown, /## Researching/);
    assert.match(markdown, /## Done/);
    assert.match(markdown, /research-001/);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("MarkdownResearchStore throws for unknown item update", async () => {
  const fixture = await createFixture();
  try {
    await assert.rejects(
      async () => await fixture.store.updateStatus("missing", "done"),
      /Research item not found: missing/,
    );
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});
