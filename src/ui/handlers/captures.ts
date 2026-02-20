import type { Hono } from "hono";
import { MarkdownTaskQueue } from "../../core/task-queue.js";
import type { CaptureType, TaskStatus } from "../../core/types/task-queue.js";

const VALID_CAPTURE_TYPES: readonly CaptureType[] = ["task", "research", "content", "feature", "seed"];
const VALID_STATUSES: readonly TaskStatus[] = ["queued", "in_progress", "blocked", "done", "failed", "cancelled"];

export function registerCaptureHandlers(app: Hono, queuePath: string): void {
  const queue = new MarkdownTaskQueue(queuePath);

  // GET /api/captures — list all captures, optionally filtered by type and/or status
  app.get("/api/captures", async (c) => {
    const typeParam = c.req.query("type") as CaptureType | undefined;
    const statusParam = c.req.query("status") as TaskStatus | undefined;

    if (typeParam && !VALID_CAPTURE_TYPES.includes(typeParam)) {
      return c.json({ error: `Invalid type: ${typeParam}` }, 400);
    }
    if (statusParam && !VALID_STATUSES.includes(statusParam)) {
      return c.json({ error: `Invalid status: ${statusParam}` }, 400);
    }

    const tasks = typeParam
      ? await queue.listByType(typeParam)
      : await queue.list(statusParam ? { status: statusParam } : undefined);

    // Apply cross-filter (type filter already applied via listByType, add status; or vice versa)
    const filtered = tasks.filter((t) => {
      if (typeParam && t.capture_type !== typeParam) return false;
      if (statusParam && t.status !== statusParam) return false;
      return true;
    });

    return c.json({ captures: filtered });
  });

  // GET /api/captures/summary — counts by type and status
  app.get("/api/captures/summary", async (c) => {
    const all = await queue.list();

    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    for (const t of all) {
      byType[t.capture_type] = (byType[t.capture_type] ?? 0) + 1;
      byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    }

    return c.json({ total: all.length, by_type: byType, by_status: byStatus });
  });

  // POST /api/captures/:id/status — update capture status
  app.post("/api/captures/:id/status", async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json<{ status: TaskStatus; result?: string }>();

    if (!body.status || !VALID_STATUSES.includes(body.status)) {
      return c.json({ error: `Invalid status: ${body.status}` }, 400);
    }

    try {
      await queue.update(id, body.status, body.result);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 404);
    }
  });
}
