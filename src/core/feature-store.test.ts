import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MarkdownFeatureStore } from "./feature-store.js";

async function createFixture(): Promise<{
  root: string;
  featurePath: string;
  store: MarkdownFeatureStore;
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-feature-store-"));
  const featurePath = path.join(root, "projects", "feature-proposals.md");
  const store = new MarkdownFeatureStore({ featurePath });
  return { root, featurePath, store };
}

test("MarkdownFeatureStore supports add/load/update flow", async () => {
  const fixture = await createFixture();
  try {
    const firstId = await fixture.store.add({
      title: "Typed capture dashboard widget",
      description: "Show capture buckets and stale items",
      rationale: "Reduces inbox triage time",
      status: "proposed",
      assignedTo: "codex",
      source: "telegram",
    });
    assert.equal(firstId, "feature-001");

    const secondId = await fixture.store.add({
      title: "Auto-triage observability",
      description: undefined,
      rationale: undefined,
      status: "planned",
      assignedTo: undefined,
      source: "cli",
    });
    assert.equal(secondId, "feature-002");

    const loaded = await fixture.store.load();
    assert.equal(loaded.length, 2);
    assert.equal(loaded[0].status, "proposed");

    await fixture.store.updateStatus(firstId, "assigned");
    await fixture.store.updateStatus(secondId, "done");

    const updated = await fixture.store.load();
    assert.equal(updated[0].status, "assigned");
    assert.equal(updated[1].status, "done");

    const markdown = await fs.readFile(fixture.featurePath, "utf8");
    assert.match(markdown, /## Proposed/);
    assert.match(markdown, /## Planned/);
    assert.match(markdown, /## Assigned/);
    assert.match(markdown, /feature-001/);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("MarkdownFeatureStore throws for unknown proposal update", async () => {
  const fixture = await createFixture();
  try {
    await assert.rejects(
      async () => await fixture.store.updateStatus("missing", "done"),
      /Feature proposal not found: missing/,
    );
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});
