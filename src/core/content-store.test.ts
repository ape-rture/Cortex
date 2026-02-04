import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MarkdownContentStore } from "./content-store.js";
import type { ContentDraft, ContentIdea, ContentSeed } from "./types/content.js";

async function createStoreFixture(): Promise<{
  root: string;
  store: MarkdownContentStore;
  ideasPath: string;
  seedsPath: string;
  draftsDir: string;
  chainsPath: string;
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-content-"));
  const projects = path.join(root, "projects");
  const draftsDir = path.join(projects, "content-drafts");
  await fs.mkdir(draftsDir, { recursive: true });

  const ideasPath = path.join(projects, "content-ideas.md");
  const seedsPath = path.join(projects, "content-seeds.md");
  const chainsPath = path.join(projects, "content-chains.md");

  const store = new MarkdownContentStore({
    ideasPath,
    seedsPath,
    draftsDir,
    chainsPath,
  });

  return { root, store, ideasPath, seedsPath, draftsDir, chainsPath };
}

test("MarkdownContentStore idea operations", async () => {
  const fixture = await createStoreFixture();
  try {
    const idea: Omit<ContentIdea, "id"> = {
      date: "2026-02-04",
      topic: "Agent handoff mistakes",
      format: "thread",
      platform: "x",
      status: "idea",
      source: "manual",
      notes: "first pass",
      tags: [],
    };

    const id = await fixture.store.addIdea(idea);
    assert.equal(id, "content-001");

    const ideas = await fixture.store.loadIdeas();
    assert.equal(ideas.length, 1);
    assert.equal(ideas[0].topic, "Agent handoff mistakes");

    await fixture.store.updateIdeaStatus(id, "review");
    const reviewed = await fixture.store.filterByStatus("review");
    assert.equal(reviewed.length, 1);

    const search = await fixture.store.searchIdeas("handoff");
    assert.equal(search.length, 1);

    const byPlatform = await fixture.store.filterByPlatform("x");
    assert.equal(byPlatform.length, 1);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("MarkdownContentStore draft and seed operations", async () => {
  const fixture = await createStoreFixture();
  try {
    const draft: ContentDraft = {
      ideaId: "content-005",
      format: "post",
      platform: "linkedin",
      currentText: "Draft text",
      revisions: [
        {
          version: 1,
          timestamp: "2026-02-04T10:00:00Z",
          text: "Draft text",
          author: "llm",
          changeNote: "initial",
        },
      ],
      updatedAt: "2026-02-04T10:00:00Z",
      threadPosts: [],
      reviewNotes: [],
    };

    await fixture.store.saveDraft(draft);
    const loadedDraft = await fixture.store.loadDraft("content-005");
    assert.ok(loadedDraft);
    assert.equal(loadedDraft?.currentText, "Draft text");

    const seeds: ContentSeed[] = [
      {
        id: "seed-001",
        insight: "One useful angle",
        source: "meeting",
        capturedAt: "2026-02-04T12:00:00Z",
        promoted: false,
      },
      {
        id: "seed-002",
        insight: "Promoted angle",
        source: "manual",
        capturedAt: "2026-02-04T12:10:00Z",
        promoted: true,
        promotedToId: "content-001",
      },
    ];
    await fixture.store.saveSeeds(seeds);
    const loadedSeeds = await fixture.store.loadSeeds();
    assert.equal(loadedSeeds.length, 2);
    assert.equal(loadedSeeds[1].promotedToId, "content-001");
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("MarkdownContentStore saves and loads chains", async () => {
  const fixture = await createStoreFixture();
  try {
    await fixture.store.saveChain({
      chainId: "chain-1",
      root: { ideaId: "content-001", platform: "youtube", format: "post" },
      derivatives: [{ ideaId: "content-002", platform: "x", format: "thread" }],
      createdAt: "2026-02-04T13:00:00Z",
    });

    const chains = await fixture.store.loadChains();
    assert.equal(chains.length, 1);
    assert.equal(chains[0].chainId, "chain-1");
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});
