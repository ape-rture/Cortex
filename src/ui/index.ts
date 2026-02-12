import { Hono } from "hono";
import path from "node:path";
import { InMemorySessionStore } from "./store.js";
import { ConfigRouter } from "../core/routing.js";
import { registerHandlers } from "./handlers/index.js";
import { readStaticFile, readDistFile, hasDashboardBuild } from "./utils.js";
import { InMemoryCycleStore } from "./cycle-store.js";
import { MarkdownReviewStore } from "./review-store.js";
import { MonitorBroker } from "./monitor-broker.js";
import type { Orchestrator } from "../core/types/orchestrator.js";
import type { TerminalSessionManager } from "./terminal/terminal-session-manager.js";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

type AppConfig = {
  systemPrompt: string;
  orchestrator: Orchestrator;
  taskBoardPath?: string;
  reviewQueuePath?: string;
  reviewStatePath?: string;
  projectRegistryPath?: string;
  terminalSessionManager?: TerminalSessionManager;
};

export function createApp(config: AppConfig): Hono {
  const app = new Hono();
  const store = new InMemorySessionStore();
  const router = new ConfigRouter();
  const cycleStore = new InMemoryCycleStore();
  const reviewStore = new MarkdownReviewStore(
    config.reviewQueuePath,
    config.reviewStatePath,
  );
  const monitorBroker = new MonitorBroker();
  const taskBoardPath = config.taskBoardPath ?? path.resolve(".cortex", "tasks.md");
  const projectRegistryPath = config.projectRegistryPath ?? path.resolve("projects", "project-registry.md");

  app.get("/healthz", (c) => c.json({ ok: true }));

  // Register API handlers first (before catch-all static serving)
  registerHandlers(app, store, router, config.systemPrompt, {
    orchestrator: config.orchestrator,
    cycleStore,
    reviewStore,
    monitorBroker,
    taskBoardPath,
    projectRegistryPath,
    terminalSessionManager: config.terminalSessionManager,
  });

  // Serve Vite dashboard build if available, otherwise fall back to legacy static
  app.get("/*", async (c) => {
    const useDashboard = await hasDashboardBuild();

    if (useDashboard) {
      // Try to serve the requested file from dist/
      const urlPath = new URL(c.req.url).pathname;
      const filePath = urlPath === "/" ? "/index.html" : urlPath;
      const content = await readDistFile(filePath.slice(1)); // remove leading /

      if (content) {
        const ext = path.extname(filePath);
        const mime = MIME_TYPES[ext] || "application/octet-stream";
        return new Response(content, {
          headers: { "Content-Type": mime },
        });
      }

      // SPA fallback: serve index.html for any unmatched route (hash routing)
      const indexContent = await readDistFile("index.html");
      if (indexContent) {
        return new Response(indexContent, {
          headers: { "Content-Type": "text/html" },
        });
      }
    }

    // Legacy fallback: serve old static files
    const urlPath = new URL(c.req.url).pathname;
    if (urlPath === "/" || urlPath === "/index.html") {
      const html = await readStaticFile("index.html");
      return c.html(html);
    }
    if (urlPath === "/style.css") {
      const css = await readStaticFile("style.css");
      return c.text(css, 200, { "Content-Type": "text/css" });
    }

    return c.text("Not found", 404);
  });

  return app;
}
