import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../index.js";
import type {
  AgentSpawnConfig,
  Orchestrator,
  OrchestratorCycle,
  Trigger,
} from "../../core/types/orchestrator.js";
import type { AgentEvent, AgentEventListener } from "../../core/types/events.js";

class FakeOrchestrator implements Orchestrator {
  private readonly listeners = new Set<AgentEventListener>();
  private runCount = 0;

  async runCycle(trigger: Trigger): Promise<OrchestratorCycle> {
    this.runCount += 1;
    const cycleId = `cycle-${this.runCount}`;
    const startedAt = new Date().toISOString();

    const startedEvent: AgentEvent = {
      type: "started",
      agent: "sales-watcher",
      cycle_id: cycleId,
      timestamp: startedAt,
      title: "Running sales-watcher",
    };
    const completedEvent: AgentEvent = {
      type: "completed",
      agent: "sales-watcher",
      cycle_id: cycleId,
      timestamp: new Date().toISOString(),
      ok: true,
      output: {
        agent: "sales-watcher",
        timestamp: startedAt,
        findings: [],
        memory_updates: [],
        errors: [],
      },
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: 12,
      },
    };

    for (const listener of this.listeners) {
      listener(startedEvent);
      listener(completedEvent);
    }

    return {
      cycle_id: cycleId,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      trigger,
      agents_spawned: trigger.agents ?? [],
      agent_outputs: [
        {
          agent: "sales-watcher",
          timestamp: startedAt,
          findings: [],
          memory_updates: [],
          errors: [],
        },
      ],
      scored_findings: [],
      surfaced: [],
      errors: [],
      events: [startedEvent, completedEvent],
    };
  }

  registerAgent(_config: AgentSpawnConfig): void {
    // no-op
  }

  async reloadConfig(): Promise<void> {
    // no-op
  }

  history(_n: number): readonly OrchestratorCycle[] {
    return [];
  }

  onEvent(listener: AgentEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-phase2-api-"));
  try {
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function makeApp(taskBoardPath: string, reviewQueuePath: string, reviewStatePath: string) {
  return createApp({
    systemPrompt: "SYSTEM",
    orchestrator: new FakeOrchestrator(),
    taskBoardPath,
    reviewQueuePath,
    reviewStatePath,
  });
}

test("Phase 2 APIs return dashboard, tasks, and review data", async () => {
  await withTempDir(async (dir) => {
    const taskBoardPath = path.join(dir, "tasks.md");
    const reviewQueuePath = path.join(dir, "review-queue.md");
    const reviewStatePath = path.join(dir, "review-state.json");

    await fs.writeFile(
      taskBoardPath,
      [
        "## Queued",
        "",
        "- **Queued task** -- Agent: codex.",
        "",
        "## In Progress",
        "",
        "- **Active task** -- Agent: claude.",
        "",
        "## Done",
        "",
        "- **Done task** -- Agent: codex.",
      ].join("\n"),
      "utf8",
    );
    await fs.writeFile(
      reviewQueuePath,
      "- [ ] **Flagged**: Check ACME data (file: contacts/acme.md)\n",
      "utf8",
    );

    const app = makeApp(taskBoardPath, reviewQueuePath, reviewStatePath);

    const tasksRes = await app.fetch(new Request("http://localhost/api/tasks"));
    assert.equal(tasksRes.status, 200);
    const tasks = await tasksRes.json() as { queued: number; in_progress: number; done: number };
    assert.equal(tasks.queued, 1);
    assert.equal(tasks.in_progress, 1);
    assert.equal(tasks.done, 1);

    const reviewRes = await app.fetch(new Request("http://localhost/api/review"));
    assert.equal(reviewRes.status, 200);
    const review = await reviewRes.json() as { items: Array<{ id: string; status: string }> };
    assert.equal(review.items.length, 1);
    assert.equal(review.items[0]?.status, "pending");

    const dashboardRes = await app.fetch(new Request("http://localhost/api/dashboard"));
    assert.equal(dashboardRes.status, 200);
    const dashboard = await dashboardRes.json() as { review_pending: number; task_summary: { queued: number } };
    assert.equal(dashboard.review_pending, 1);
    assert.equal(dashboard.task_summary.queued, 1);
  });
});

test("Phase 2 orchestrator trigger endpoint records cycles and exposes monitor stream", async () => {
  await withTempDir(async (dir) => {
    const taskBoardPath = path.join(dir, "tasks.md");
    const reviewQueuePath = path.join(dir, "review-queue.md");
    const reviewStatePath = path.join(dir, "review-state.json");
    await fs.writeFile(taskBoardPath, "## Queued\n\n", "utf8");
    await fs.writeFile(reviewQueuePath, "", "utf8");

    const app = makeApp(taskBoardPath, reviewQueuePath, reviewStatePath);

    const triggerRes = await app.fetch(
      new Request("http://localhost/api/orchestrate/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agents: ["sales-watcher"] }),
      }),
    );
    assert.equal(triggerRes.status, 200);
    const triggerData = await triggerRes.json() as { cycle_id: string; status: string };
    assert.equal(triggerData.status, "completed");
    assert.ok(triggerData.cycle_id.startsWith("cycle-"));

    const cyclesRes = await app.fetch(new Request("http://localhost/api/dashboard/cycles?limit=5"));
    assert.equal(cyclesRes.status, 200);
    const cyclesData = await cyclesRes.json() as { cycles: Array<{ cycle_id: string }> };
    assert.equal(cyclesData.cycles.length, 1);
    assert.equal(cyclesData.cycles[0]?.cycle_id, triggerData.cycle_id);

    const monitorRes = await app.fetch(new Request("http://localhost/api/monitor/stream?once=1"));
    assert.equal(monitorRes.status, 200);
    assert.match(monitorRes.headers.get("content-type") ?? "", /text\/event-stream/);
    const monitorBody = await monitorRes.text();
    assert.ok(monitorBody.includes("event: heartbeat"));
  });
});

test("Phase 2 review endpoints support approve and snooze transitions", async () => {
  await withTempDir(async (dir) => {
    const taskBoardPath = path.join(dir, "tasks.md");
    const reviewQueuePath = path.join(dir, "review-queue.md");
    const reviewStatePath = path.join(dir, "review-state.json");
    await fs.writeFile(taskBoardPath, "## Queued\n\n", "utf8");
    await fs.writeFile(
      reviewQueuePath,
      "- [ ] **Flagged**: Needs manual review (file: context/weekly-focus.md)\n",
      "utf8",
    );

    const app = makeApp(taskBoardPath, reviewQueuePath, reviewStatePath);
    const initial = await app.fetch(new Request("http://localhost/api/review"));
    const initialData = await initial.json() as { items: Array<{ id: string }> };
    const itemId = initialData.items[0]?.id;
    assert.ok(itemId);

    const snoozeRes = await app.fetch(
      new Request(`http://localhost/api/review/${itemId}/snooze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duration: "1h" }),
      }),
    );
    assert.equal(snoozeRes.status, 200);
    const snoozeData = await snoozeRes.json() as { status: string };
    assert.equal(snoozeData.status, "snoozed");

    const approveRes = await app.fetch(
      new Request(`http://localhost/api/review/${itemId}/approve`, {
        method: "POST",
      }),
    );
    assert.equal(approveRes.status, 200);
    const approveData = await approveRes.json() as { status: string };
    assert.equal(approveData.status, "approved");
  });
});
