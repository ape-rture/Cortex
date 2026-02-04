import { Hono } from "hono";
import { InMemorySessionStore } from "./store.js";
import { ConfigRouter } from "../core/routing.js";
import { registerHandlers } from "./handlers/index.js";
import { readStaticFile } from "./utils.js";

type AppConfig = {
  systemPrompt: string;
};

export function createApp(config: AppConfig): Hono {
  const app = new Hono();
  const store = new InMemorySessionStore();
  const router = new ConfigRouter();

  app.get("/healthz", (c) => c.json({ ok: true }));

  app.get("/", async (c) => {
    const html = await readStaticFile("index.html");
    return c.html(html);
  });

  app.get("/style.css", async (c) => {
    const css = await readStaticFile("style.css");
    return c.text(css, 200, { "Content-Type": "text/css" });
  });

  registerHandlers(app, store, router, config.systemPrompt);

  return app;
}
