import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MarkdownEntityStore } from "./entity-store.js";
import type { AtomicFact, EntitySummary } from "./types/entity.js";

interface TempFixture {
  root: string;
  entitiesRoot: string;
}

async function withFixture(fn: (fixture: TempFixture) => Promise<void>): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-entity-store-"));
  const entitiesRoot = path.join(root, "entities");
  await fs.mkdir(path.join(entitiesRoot, "people"), { recursive: true });
  await fs.mkdir(path.join(entitiesRoot, "companies"), { recursive: true });
  await fs.mkdir(path.join(entitiesRoot, "topics"), { recursive: true });
  await fs.writeFile(
    path.join(entitiesRoot, "_template-summary.md"),
    [
      "---",
      "id: {id}",
      "kind: {kind}",
      "name: {name}",
      "lastUpdated: {timestamp}",
      "factCount: 0",
      "activeFactCount: 0",
      "tags: []",
      "---",
      "",
      "# {name}",
      "",
      "*No summary yet - seeded from template.*",
      "",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(path.join(entitiesRoot, "_template-facts.json"), "[]\n", "utf8");

  try {
    await fn({ root, entitiesRoot });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

function fact(id: string, status: "active" | "superseded" = "active"): AtomicFact {
  return {
    id,
    fact: `Fact ${id}`,
    category: "status",
    timestamp: "2026-02-10T10:00:00.000Z",
    source: "manual",
    confidence: 0.9,
    status,
  };
}

test("MarkdownEntityStore createEntity scaffolds from templates and loadSummary parses front matter", async () => {
  await withFixture(async ({ entitiesRoot }) => {
    const store = new MarkdownEntityStore({ entitiesRoot });
    await store.createEntity("people", "sarah-chen", "Sarah Chen");

    const summary = await store.loadSummary("people", "sarah-chen");
    assert.ok(summary);
    assert.equal(summary?.id, "sarah-chen");
    assert.equal(summary?.kind, "people");
    assert.equal(summary?.name, "Sarah Chen");
    assert.equal(summary?.factCount, 0);
    assert.equal(summary?.activeFactCount, 0);
    assert.ok(summary?.summary.includes("No summary yet"));

    const facts = await store.loadFacts("people", "sarah-chen");
    assert.equal(facts.length, 0);
  });
});

test("MarkdownEntityStore listEntities scans entity subdirectories", async () => {
  await withFixture(async ({ entitiesRoot }) => {
    const store = new MarkdownEntityStore({ entitiesRoot });
    await store.createEntity("people", "sarah-chen", "Sarah Chen");
    await store.createEntity("people", "arjun", "Arjun");

    const people = await store.listEntities("people");
    assert.deepEqual(people, ["arjun", "sarah-chen"]);
  });
});

test("MarkdownEntityStore append/load/loadActive facts flow", async () => {
  await withFixture(async ({ entitiesRoot }) => {
    const store = new MarkdownEntityStore({ entitiesRoot });
    await store.appendFacts("topics", "memory-flywheel", [fact("f1"), fact("f2", "superseded")]);

    const allFacts = await store.loadFacts("topics", "memory-flywheel");
    assert.equal(allFacts.length, 2);

    const active = await store.loadActiveFacts("topics", "memory-flywheel");
    assert.equal(active.length, 1);
    assert.equal(active[0]?.id, "f1");
  });
});

test("MarkdownEntityStore supersedeFacts marks matching fact IDs", async () => {
  await withFixture(async ({ entitiesRoot }) => {
    const store = new MarkdownEntityStore({ entitiesRoot });
    await store.appendFacts("companies", "acme", [fact("old"), fact("new")]);

    await store.supersedeFacts("companies", "acme", [
      { factId: "old", supersededBy: "new" },
    ]);

    const facts = await store.loadFacts("companies", "acme");
    const old = facts.find((item) => item.id === "old");
    const newer = facts.find((item) => item.id === "new");
    assert.equal(old?.status, "superseded");
    assert.equal(old?.supersededBy, "new");
    assert.equal(newer?.status, "active");
  });
});

test("MarkdownEntityStore writeSummary persists and can be reloaded", async () => {
  await withFixture(async ({ entitiesRoot }) => {
    const store = new MarkdownEntityStore({ entitiesRoot });

    const summary: EntitySummary = {
      id: "acme",
      kind: "companies",
      name: "ACME Corp",
      summary: "ACME moved from pilot to rollout in Q1.",
      lastUpdated: "2026-02-10T11:00:00.000Z",
      factCount: 12,
      activeFactCount: 10,
      tags: ["customer", "priority"],
    };
    await store.writeSummary("companies", "acme", summary);

    const loaded = await store.loadSummary("companies", "acme");
    assert.ok(loaded);
    assert.equal(loaded?.name, "ACME Corp");
    assert.equal(loaded?.factCount, 12);
    assert.equal(loaded?.activeFactCount, 10);
    assert.deepEqual(loaded?.tags, ["customer", "priority"]);
    assert.equal(loaded?.summary, "ACME moved from pilot to rollout in Q1.");
  });
});
