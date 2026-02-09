import type { Hono } from "hono";
import { jsonError } from "../utils.js";
import type { ReviewStore } from "../review-store.js";

export function registerReviewHandlers(app: Hono, reviewStore: ReviewStore): void {
  app.get("/api/review", async (c) => {
    const items = await reviewStore.list();
    return c.json({ items });
  });

  app.post("/api/review/:id/approve", async (c) => {
    const item = await reviewStore.approve(c.req.param("id"));
    if (!item) return jsonError(c, "Review item not found", 404);
    return c.json({ status: "approved", item });
  });

  app.post("/api/review/:id/dismiss", async (c) => {
    const item = await reviewStore.dismiss(c.req.param("id"));
    if (!item) return jsonError(c, "Review item not found", 404);
    return c.json({ status: "dismissed", item });
  });

  app.post("/api/review/:id/snooze", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { duration?: string };
    const duration = body.duration?.trim();
    if (!duration) {
      return jsonError(c, "Missing snooze duration", 400);
    }

    try {
      const item = await reviewStore.snooze(c.req.param("id"), duration);
      if (!item) return jsonError(c, "Review item not found", 404);
      return c.json({ status: "snoozed", item });
    } catch (err) {
      return jsonError(
        c,
        err instanceof Error ? err.message : "Invalid snooze request",
        400,
      );
    }
  });
}
