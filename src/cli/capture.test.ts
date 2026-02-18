import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCapture } from "./capture.js";
import { MarkdownResearchStore } from "../core/research-store.js";
import { MarkdownFeatureStore } from "../core/feature-store.js";
import { MarkdownIdeaStore } from "../core/idea-store.js";
import { MarkdownContentStore } from "../core/content-store.js";
import { MarkdownTaskQueue } from "../core/task-queue.js";
import type { RouteRequest, RouteResponse } from "../core/types/routing.js";

interface Fixture {
  readonly root: string;
  readonly researchPath: string;
  readonly featurePath: string;
  readonly ideaPath: string;
  readonly contentIdeasPath: string;
  readonly contentSeedsPath: string;
  readonly contentDraftsPath: string;
  readonly contentChainsPath: string;
  readonly queuePath: string;
  readonly pendingPath: string;
  readonly cortexTasksPath: string;
}

async function createFixture(): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-capture-cli-"));
  const actionsDir = path.join(root, "actions");
  const projectsDir = path.join(root, "projects");
  const cortexDir = path.join(root, ".cortex");
  await fs.mkdir(actionsDir, { recursive: true });
  await fs.mkdir(projectsDir, { recursive: true });
  await fs.mkdir(cortexDir, { recursive: true });

  const researchPath = path.join(actionsDir, "research-queue.md");
  const featurePath = path.join(projectsDir, "feature-proposals.md");
  const ideaPath = path.join(projectsDir, "ideas.md");
  const contentIdeasPath = path.join(projectsDir, "content-ideas.md");
  const contentSeedsPath = path.join(projectsDir, "content-seeds.md");
  const contentDraftsPath = path.join(projectsDir, "content-drafts");
  const contentChainsPath = path.join(projectsDir, "content-chains.md");
  const queuePath = path.join(actionsDir, "queue.md");
  const pendingPath = path.join(actionsDir, "pending.md");
  const cortexTasksPath = path.join(cortexDir, "tasks.md");

  await fs.writeFile(pendingPath, `# Pending Action Items

## Overdue
[Items past their due date]

## Today
[Items due today]

## This Week
[Items due this week]

## Later
[Items with future due dates or no date]
`, "utf8");

  await fs.writeFile(cortexTasksPath, `# Task Board

## Queued

*Add tasks here.*
`, "utf8");

  return {
    root,
    researchPath,
    featurePath,
    ideaPath,
    contentIdeasPath,
    contentSeedsPath,
    contentDraftsPath,
    contentChainsPath,
    queuePath,
    pendingPath,
    cortexTasksPath,
  };
}

function createRouterStub(content: string): { route: (request: RouteRequest) => Promise<RouteResponse> } {
  return {
    route: async () => ({
      content,
      model_used: "openai:test",
      used_fallback: false,
      usage: { input_tokens: 1, output_tokens: 1 },
      latency_ms: 1,
    }),
  };
}

test("runCapture routes explicit research/feature/seed commands", async () => {
  const fixture = await createFixture();
  try {
    const researchStore = new MarkdownResearchStore({ researchPath: fixture.researchPath });
    const featureStore = new MarkdownFeatureStore({ featurePath: fixture.featurePath });
    const ideaStore = new MarkdownIdeaStore({ ideaPath: fixture.ideaPath });
    const contentStore = new MarkdownContentStore({
      ideasPath: fixture.contentIdeasPath,
      seedsPath: fixture.contentSeedsPath,
      draftsDir: fixture.contentDraftsPath,
      chainsPath: fixture.contentChainsPath,
    });
    const queue = new MarkdownTaskQueue(fixture.queuePath);

    const options = {
      researchStore,
      featureStore,
      ideaStore,
      contentStore,
      taskQueue: queue,
      pendingPath: fixture.pendingPath,
      cortexTasksPath: fixture.cortexTasksPath,
      router: createRouterStub("{\"category\":\"research\",\"confidence\":0.9}"),
    };

    const researchResult = await runCapture(["research", "Investigate local embeddings"], options);
    assert.match(researchResult, /Captured research item research-001/);

    const featureResult = await runCapture(["feature", "Add /capture dashboard"], options);
    assert.match(featureResult, /Captured feature proposal feature-001/);

    const seedResult = await runCapture(["seed", "Ship a lightweight agent runner"], options);
    assert.match(seedResult, /Captured project seed seed-001/);

    assert.equal((await researchStore.load()).length, 1);
    assert.equal((await featureStore.load()).length, 1);
    assert.equal((await ideaStore.load()).length, 1);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("runCapture auto-classifies untagged input and handles #tag fast path", async () => {
  const fixture = await createFixture();
  try {
    const options = {
      researchStore: new MarkdownResearchStore({ researchPath: fixture.researchPath }),
      featureStore: new MarkdownFeatureStore({ featurePath: fixture.featurePath }),
      ideaStore: new MarkdownIdeaStore({ ideaPath: fixture.ideaPath }),
      contentStore: new MarkdownContentStore({
        ideasPath: fixture.contentIdeasPath,
        seedsPath: fixture.contentSeedsPath,
        draftsDir: fixture.contentDraftsPath,
        chainsPath: fixture.contentChainsPath,
      }),
      taskQueue: new MarkdownTaskQueue(fixture.queuePath),
      pendingPath: fixture.pendingPath,
      cortexTasksPath: fixture.cortexTasksPath,
      router: createRouterStub("{\"category\":\"cortex_feature\",\"confidence\":0.88}"),
    };

    const auto = await runCapture(["Need", "a", "native", "sync", "for", "typed", "capture"], options);
    assert.match(auto, /Captured feature proposal feature-001/);

    const tagged = await runCapture(["#action", "book", "dentist", "appointment"], {
      ...options,
      router: createRouterStub("{\"category\":\"needs_review\",\"confidence\":0.1}"),
    });
    assert.match(tagged, /Captured action item to actions\/pending\.md/);

    const pending = await fs.readFile(fixture.pendingPath, "utf8");
    assert.match(pending, /book dentist appointment/);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("runCapture supports list and inbox views", async () => {
  const fixture = await createFixture();
  try {
    const queue = new MarkdownTaskQueue(fixture.queuePath);
    await queue.add({
      title: "Telegram capture one",
      priority: "p2",
      source: "telegram",
      context_refs: ["telegram:100:1"],
      tags: ["capture_type:research"],
    });
    await queue.add({
      title: "Slack capture two",
      priority: "p1",
      source: "slack",
      context_refs: ["slack:C1:22"],
      tags: ["capture_type:feature"],
    });

    const options = {
      researchStore: new MarkdownResearchStore({ researchPath: fixture.researchPath }),
      featureStore: new MarkdownFeatureStore({ featurePath: fixture.featurePath }),
      ideaStore: new MarkdownIdeaStore({ ideaPath: fixture.ideaPath }),
      contentStore: new MarkdownContentStore({
        ideasPath: fixture.contentIdeasPath,
        seedsPath: fixture.contentSeedsPath,
        draftsDir: fixture.contentDraftsPath,
        chainsPath: fixture.contentChainsPath,
      }),
      taskQueue: queue,
      pendingPath: fixture.pendingPath,
      cortexTasksPath: fixture.cortexTasksPath,
      router: createRouterStub("{\"category\":\"research\",\"confidence\":0.9}"),
    };

    await runCapture(["research", "Trace capture parser"], options);

    const list = await runCapture(["list", "research"], options);
    assert.match(list, /research-001/);

    const inbox = await runCapture(["inbox"], options);
    assert.match(inbox, /Capture Inbox \(2\)/);
    assert.match(inbox, /Telegram capture one/);
    assert.match(inbox, /Slack capture two/);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});
