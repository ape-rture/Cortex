import type { Hono } from "hono";
import type { CreateSessionRequest } from "../types.js";
import { jsonError } from "../utils.js";
import { InMemorySessionStore } from "../store.js";

export function registerSessionHandlers(app: Hono, store: InMemorySessionStore): void {
  app.get("/api/sessions", (c) => {
    return c.json({ sessions: store.list() });
  });

  app.post("/api/sessions", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as CreateSessionRequest;
    const session = store.create(body.name);
    return c.json({ id: session.id, name: session.name, created_at: session.created_at });
  });

  app.get("/api/sessions/:id", (c) => {
    const session = store.get(c.req.param("id"));
    if (!session) return jsonError(c, "Session not found", 404);
    return c.json(session);
  });

  app.delete("/api/sessions/:id", (c) => {
    const deleted = store.delete(c.req.param("id"));
    if (!deleted) return jsonError(c, "Session not found", 404);
    return c.json({ status: "deleted" });
  });
}
