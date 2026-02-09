import type { Hono } from "hono";
import type { CycleStore } from "../cycle-store.js";
import type { ReviewStore } from "../review-store.js";
import { loadTaskSummary } from "./tasks.js";

export function registerDashboardHandlers(
  app: Hono,
  cycleStore: CycleStore,
  reviewStore: ReviewStore,
  taskBoardPath: string,
): void {
  app.get("/api/dashboard", async (c) => {
    const [reviewPending, taskSummary] = await Promise.all([
      reviewStore.pendingCount(),
      loadTaskSummary(taskBoardPath),
    ]);

    return c.json({
      last_cycle: cycleStore.latest(),
      agent_health: cycleStore.agentHealth(),
      review_pending: reviewPending,
      task_summary: taskSummary,
    });
  });

  app.get("/api/dashboard/cycles", (c) => {
    const parsed = Number.parseInt(c.req.query("limit") ?? "10", 10);
    const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100) : 10;
    return c.json({ cycles: cycleStore.list(limit) });
  });
}
