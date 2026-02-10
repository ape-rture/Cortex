import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemorySynthesizerAgent } from "./memory-synthesizer.js";
import type { AgentRunContext } from "../core/agent-runner.js";
import type {
  AtomicFact,
  EntityKind,
  EntityStore,
  EntitySummary,
  FactSupersession,
} from "../core/types/entity.js";
import type { RouteRequest, RouteResponse } from "../core/types/routing.js";

class FakeRouter {
  public calls: RouteRequest[] = [];

  constructor(private readonly handler: (request: RouteRequest) => Promise<RouteResponse>) {}

  async route(request: RouteRequest): Promise<RouteResponse> {
    this.calls.push(request);
    return await this.handler(request);
  }
}

class FakeEntityStore implements EntityStore {
  public supersessionCalls: Array<{ kind: EntityKind; id: string; supersessions: readonly FactSupersession[] }> = [];
  public writeCalls: Array<{ kind: EntityKind; id: string; summary: EntitySummary }> = [];

  private readonly summaries = new Map<string, EntitySummary>();
  private readonly facts = new Map<string, AtomicFact[]>();

  constructor() {
    this.summaries.set(
      "people:sarah-chen",
      {
        id: "sarah-chen",
        kind: "people",
        name: "Sarah Chen",
        summary: "Sarah was VP Engineering at Acme.",
        lastUpdated: "2026-02-05T00:00:00.000Z",
        factCount: 2,
        activeFactCount: 2,
        tags: ["customer"],
      },
    );
    this.summaries.set(
      "topics:stale-topic",
      {
        id: "stale-topic",
        kind: "topics",
        name: "Stale Topic",
        summary: "Topic summary",
        lastUpdated: "2025-10-01T00:00:00.000Z",
        factCount: 1,
        activeFactCount: 1,
        tags: [],
      },
    );

    this.facts.set("people:sarah-chen", [
      {
        id: "old-role",
        fact: "Sarah is VP Engineering at Acme",
        category: "status",
        timestamp: "2026-02-01T00:00:00.000Z",
        source: "manual",
        confidence: 0.9,
        status: "active",
      },
      {
        id: "new-role",
        fact: "Sarah is CTO at Acme",
        category: "status",
        timestamp: "2026-02-09T00:00:00.000Z",
        source: "meeting",
        sourceRef: "meetings/2026-02/sync.md",
        confidence: 0.95,
        status: "active",
      },
    ]);
    this.facts.set("topics:stale-topic", [
      {
        id: "stale-1",
        fact: "Old status fact",
        category: "status",
        timestamp: "2025-10-01T00:00:00.000Z",
        source: "manual",
        confidence: 0.7,
        status: "active",
      },
    ]);
  }

  async listEntities(kind: EntityKind): Promise<readonly string[]> {
    if (kind === "people") return ["sarah-chen"];
    if (kind === "topics") return ["stale-topic"];
    return [];
  }

  async loadSummary(kind: EntityKind, id: string): Promise<EntitySummary | null> {
    return this.summaries.get(`${kind}:${id}`) ?? null;
  }

  async loadFacts(kind: EntityKind, id: string): Promise<readonly AtomicFact[]> {
    return this.facts.get(`${kind}:${id}`) ?? [];
  }

  async loadActiveFacts(kind: EntityKind, id: string): Promise<readonly AtomicFact[]> {
    return (this.facts.get(`${kind}:${id}`) ?? []).filter((fact) => fact.status === "active");
  }

  async appendFacts(): Promise<void> {
    throw new Error("not implemented");
  }

  async supersedeFacts(kind: EntityKind, id: string, supersessions: readonly FactSupersession[]): Promise<void> {
    this.supersessionCalls.push({ kind, id, supersessions });
    const key = `${kind}:${id}`;
    const current = this.facts.get(key) ?? [];
    const map = new Map(supersessions.map((entry) => [entry.factId, entry.supersededBy]));
    this.facts.set(
      key,
      current.map((fact) => {
        const supersededBy = map.get(fact.id);
        if (!supersededBy) return fact;
        return {
          ...fact,
          status: "superseded",
          supersededBy,
        };
      }),
    );
  }

  async writeSummary(kind: EntityKind, id: string, summary: EntitySummary): Promise<void> {
    this.writeCalls.push({ kind, id, summary });
    this.summaries.set(`${kind}:${id}`, summary);
  }

  async createEntity(): Promise<void> {
    throw new Error("not implemented");
  }
}

function makeContext(basePath: string = process.cwd()): AgentRunContext {
  return {
    agent: "memory-synthesizer",
    cycle_id: "cycle-1",
    trigger: {
      type: "cron",
      agents: ["memory-synthesizer"],
    },
    basePath,
  };
}

test("memory synthesizer updates summaries and applies supersessions", async () => {
  const store = new FakeEntityStore();
  const router = new FakeRouter(async () => ({
    model_used: "anthropic:sonnet",
    used_fallback: false,
    content: JSON.stringify({
      summary_updates: [
        {
          entityKind: "people",
          entityId: "sarah-chen",
          newSummary: "Sarah Chen is CTO at Acme and is evaluating enterprise data work.",
          tags: ["customer-contact", "decision-maker"],
        },
      ],
      supersessions: [
        {
          entityKind: "people",
          entityId: "sarah-chen",
          oldFactId: "old-role",
          newFactId: "new-role",
        },
      ],
    }),
    usage: { input_tokens: 200, output_tokens: 120 },
    latency_ms: 80,
  }));

  const agent = createMemorySynthesizerAgent({
    router,
    entityStore: store,
    promptPath: "src/agents/prompts/memory-synthesizer.md",
    now: () => new Date("2026-02-10T12:00:00.000Z"),
  });

  const output = await agent(makeContext());

  assert.equal(output.errors.length, 0);
  assert.equal(router.calls.length, 1);
  assert.equal(store.supersessionCalls.length, 1);
  assert.equal(store.writeCalls.length, 1);
  assert.equal(store.writeCalls[0]?.kind, "people");
  assert.equal(store.writeCalls[0]?.id, "sarah-chen");
  assert.ok(store.writeCalls[0]?.summary.summary.includes("Sarah Chen is CTO"));
  assert.ok(output.findings.some((finding) => finding.summary.includes("updated 1 entity")));
});

test("memory synthesizer surfaces stale entities without forcing updates", async () => {
  const store = new FakeEntityStore();
  const router = new FakeRouter(async () => ({
    model_used: "anthropic:sonnet",
    used_fallback: false,
    content: JSON.stringify({ summary_updates: [], supersessions: [] }),
    usage: { input_tokens: 100, output_tokens: 40 },
    latency_ms: 40,
  }));

  const agent = createMemorySynthesizerAgent({
    router,
    entityStore: store,
    promptPath: "src/agents/prompts/memory-synthesizer.md",
    now: () => new Date("2026-02-10T12:00:00.000Z"),
  });

  const output = await agent(makeContext());

  assert.ok(output.findings.some((finding) => finding.summary.includes("stale")));
  assert.equal(output.errors.length, 0);
});
