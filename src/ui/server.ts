import { serve } from "@hono/node-server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createApp } from "./index.js";

async function loadSystemPrompt(): Promise<string> {
  const filePath = path.resolve("SYSTEM.md");
  return await fs.readFile(filePath, "utf8");
}

async function start(): Promise<void> {
  const systemPrompt = await loadSystemPrompt();
  const app = createApp({ systemPrompt });
  const port = Number.parseInt(process.env.UI_PORT ?? "8787", 10);

  serve({ fetch: app.fetch, port });
  console.log(`Cortex UI listening on http://localhost:${port}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  start().catch((err) => {
    console.error("Failed to start UI server:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
