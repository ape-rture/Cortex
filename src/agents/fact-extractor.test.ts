import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createFactExtractorAgent } from "./fact-extractor.js";
import { MarkdownEntityStore } from "../core/entity-store.js";
import type { AgentRunContext } from "../core/agent-runner.js";
import type { RouteRequest, RouteResponse } from "../core/types/routing.js";

class FakeRouter {
  public calls: RouteRequest[] = [];

  constructor(private readonly handler: (request: RouteRequest) => Promise<RouteResponse>) {}

  async route(request: RouteRequest): Promise<RouteResponse> {
    this.calls.push(request);
    return await this.handler(request);
  }
}

async function withFixture(fn: (root: string) => Promise<void>): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-fact-extractor-"));
  try {
    await fs.mkdir(path.join(root, "meetings", "2026-02"), { recursive: true });
    await fs.mkdir(path.join(root, "daily"), { recursive: true });
    await fs.mkdir(path.join(root, "entities", "people"), { recursive: true });
    await fs.mkdir(path.join(root, "entities", "companies"), { recursive: true });
    await fs.mkdir(path.join(root, "entities", "projects"), { recursive: true });
    await fs.mkdir(path.join(root, "entities", "topics"), { recursive: true });

    await fs.writeFile(
      path.join(root, "entities", "_template-summary.md"),
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
        "*No summary yet*",
      ].join("\n"),
      "utf8",
    );
    await fs.writeFile(path.join(root, "entities", "_template-facts.json"), "[]\n", "utf8");
    await fn(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

function makeContext(basePath: string): AgentRunContext {
  return {
    agent: "fact-extractor",
    cycle_id: "cycle-1",
    trigger: {
      type: "cron",
      agents: ["fact-extractor"],
    },
    basePath,
  };
}

test("fact extractor parses extraction response and creates entity facts", async () => {
  await withFixture(async (root) => {
    const recentMeeting = path.join(root, "meetings", "2026-02", "2026-02-10-sync.md");
    const oldDaily = path.join(root, "daily", "2026-02-01.md");
    const promptPath = path.join(root, "prompt.md");

    await fs.writeFile(promptPath, "Fact extractor system prompt", "utf8");
    await fs.writeFile(recentMeeting, "Sarah became CTO at Acme Corp", "utf8");
    await fs.writeFile(oldDaily, "Old note", "utf8");

    const old = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    await fs.utimes(oldDaily, old, old);

    const router = new FakeRouter(async () => ({
      model_used: "anthropic:haiku",
      used_fallback: false,
      content: JSON.stringify({
        entities: [
          {
            entityKind: "people",
            entityId: "sarah-chen",
            entityName: "Sarah Chen",
            facts: [
              {
                fact: "Sarah Chen is CTO at Acme Corp",
                category: "status",
                confidence: 0.92,
                reasoning: "explicit mention",
              },
            ],
          },
        ],
      }),
      usage: { input_tokens: 120, output_tokens: 80 },
      latency_ms: 55,
    }));

    const store = new MarkdownEntityStore({ entitiesRoot: path.join(root, "entities") });
    const agent = createFactExtractorAgent({
      router,
      entityStore: store,
      promptPath,
    });
    const output = await agent(makeContext(root));

    assert.equal(output.errors.length, 0);
    assert.equal(router.calls.length, 1);
    assert.equal(router.calls[0]?.task_type, "fact_extraction");

    const entities = await store.listEntities("people");
    assert.deepEqual(entities, ["sarah-chen"]);
    const facts = await store.loadFacts("people", "sarah-chen");
    assert.equal(facts.length, 1);
    assert.equal(facts[0]?.fact, "Sarah Chen is CTO at Acme Corp");
    assert.equal(facts[0]?.source, "meeting");
    assert.ok(facts[0]?.sourceRef?.startsWith("meetings/"));

    assert.ok(output.findings[0]?.summary.includes("Extracted 1 fact"));
  });
});

test("fact extractor falls back when fact_extraction task type is missing from routes", async () => {
  await withFixture(async (root) => {
    const recentMeeting = path.join(root, "meetings", "2026-02", "2026-02-10-sync.md");
    const promptPath = path.join(root, "prompt.md");
    await fs.writeFile(promptPath, "Fact extractor system prompt", "utf8");
    await fs.writeFile(recentMeeting, "Sarah became CTO at Acme Corp", "utf8");

    let first = true;
    const router = new FakeRouter(async (request) => {
      if (first) {
        first = false;
        assert.equal(request.task_type, "fact_extraction");
        throw new Error("No route for task type: fact_extraction");
      }
      assert.equal(request.task_type, "classification");
      return {
        model_used: "anthropic:haiku",
        used_fallback: false,
        content: JSON.stringify({ entities: [] }),
        usage: { input_tokens: 30, output_tokens: 10 },
        latency_ms: 25,
      };
    });

    const agent = createFactExtractorAgent({
      router,
      entityStore: new MarkdownEntityStore({ entitiesRoot: path.join(root, "entities") }),
      promptPath,
    });
    const output = await agent(makeContext(root));

    assert.equal(output.errors.length, 0);
    assert.equal(router.calls.length, 2);
  });
});
