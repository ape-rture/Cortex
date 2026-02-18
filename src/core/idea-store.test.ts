import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MarkdownIdeaStore } from "./idea-store.js";

async function createFixture(): Promise<{
  root: string;
  ideaPath: string;
  store: MarkdownIdeaStore;
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-idea-store-"));
  const ideaPath = path.join(root, "projects", "ideas.md");
  const store = new MarkdownIdeaStore({ ideaPath });
  return { root, ideaPath, store };
}

test("MarkdownIdeaStore supports add/load/update/category flow", async () => {
  const fixture = await createFixture();
  try {
    const firstId = await fixture.store.add({
      title: "Personal CRM CLI spinout",
      description: "Extract into standalone OSS package",
      category: "open-source",
      status: "seed",
      tags: ["shareable", "crm"],
      source: "telegram",
    });
    assert.equal(firstId, "seed-001");

    const secondId = await fixture.store.add({
      title: "Voice-only capture mode",
      description: undefined,
      category: "product",
      status: "evaluating",
      tags: ["voice"],
      source: "cli",
    });
    assert.equal(secondId, "seed-002");

    const loaded = await fixture.store.load();
    assert.equal(loaded.length, 2);
    assert.equal(loaded[0].status, "seed");

    await fixture.store.updateStatus(firstId, "accepted");
    const accepted = await fixture.store.listByCategory("open-source");
    assert.equal(accepted.length, 1);
    assert.equal(accepted[0].id, firstId);
    assert.equal(accepted[0].status, "accepted");

    const markdown = await fs.readFile(fixture.ideaPath, "utf8");
    assert.match(markdown, /## Seed/);
    assert.match(markdown, /## Accepted/);
    assert.match(markdown, /seed-001/);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("MarkdownIdeaStore throws for unknown seed update", async () => {
  const fixture = await createFixture();
  try {
    await assert.rejects(
      async () => await fixture.store.updateStatus("missing", "parked"),
      /Project seed not found: missing/,
    );
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});
