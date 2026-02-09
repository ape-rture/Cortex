import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryCycleStore } from "./cycle-store.js";
import type { OrchestratorCycle } from "../core/types/orchestrator.js";

function makeCycle(
  cycleId: string,
  agent: string,
  ok: boolean,
  latencyMs: number,
): OrchestratorCycle {
  const started = "2026-02-09T00:00:00.000Z";
  return {
    cycle_id: cycleId,
    started_at: started,
    completed_at: "2026-02-09T00:00:01.000Z",
    trigger: { type: "cli", agents: [agent] },
    agents_spawned: [agent],
    agent_outputs: [
      {
        agent,
        timestamp: started,
        findings: [],
        memory_updates: [],
        errors: ok ? [] : ["boom"],
      },
    ],
    scored_findings: [],
    surfaced: [],
    errors: [],
    events: [
      {
        type: "started",
        agent,
        cycle_id: cycleId,
        timestamp: started,
      },
      {
        type: "completed",
        agent,
        cycle_id: cycleId,
        timestamp: "2026-02-09T00:00:01.000Z",
        ok,
        output: {
          agent,
          timestamp: started,
          findings: [],
          memory_updates: [],
          errors: ok ? [] : ["boom"],
        },
        error: ok ? undefined : "boom",
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          latency_ms: latencyMs,
        },
      },
    ],
  };
}

test("InMemoryCycleStore returns latest cycle summary in reverse chronological list", () => {
  const store = new InMemoryCycleStore();
  store.add(makeCycle("c1", "sales-watcher", true, 120));
  store.add(makeCycle("c2", "code-watcher", true, 80));

  const latest = store.latest();
  assert.equal(latest?.cycle_id, "c2");

  const list = store.list(2);
  assert.equal(list.length, 2);
  assert.equal(list[0]?.cycle_id, "c2");
  assert.equal(list[1]?.cycle_id, "c1");
});

test("InMemoryCycleStore computes agent health from cycle history", () => {
  const store = new InMemoryCycleStore();
  store.add(makeCycle("c1", "sales-watcher", true, 100));
  store.add(makeCycle("c2", "sales-watcher", false, 200));

  const health = store.agentHealth();
  const sales = health["sales-watcher"];
  assert.ok(sales);
  assert.equal(sales?.total_runs, 2);
  assert.equal(sales?.total_errors, 1);
  assert.equal(sales?.last_ok, false);
  assert.equal(sales?.avg_latency_ms, 150);
});
