import type { Hono } from "hono";
import { InMemorySessionStore } from "../store.js";
import { ConfigRouter } from "../../core/routing.js";
import { registerSessionHandlers } from "./sessions.js";
import { registerChatHandlers } from "./chat.js";

export function registerHandlers(
  app: Hono,
  store: InMemorySessionStore,
  router: ConfigRouter,
  systemPrompt: string,
): void {
  registerSessionHandlers(app, store);
  registerChatHandlers(app, store, router, systemPrompt);
}
