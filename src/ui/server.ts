import "dotenv/config";
import { serve } from "@hono/node-server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createApp } from "./index.js";
import { CortexOrchestrator } from "../core/orchestrator.js";
import { salesWatcherAgent } from "../agents/sales-watcher.js";
import { contentScannerAgent } from "../agents/content-scanner.js";
import { codeWatcherAgent } from "../agents/code-watcher.js";
import { projectHeartbeatAgent } from "../agents/project-heartbeat.js";
import { factExtractorAgent } from "../agents/fact-extractor.js";
import { memorySynthesizerAgent } from "../agents/memory-synthesizer.js";
import { TerminalSessionManager } from "./terminal/terminal-session-manager.js";
import { createTerminalWsServer } from "./terminal/ws-server.js";

async function loadSystemPrompt(): Promise<string> {
  const filePath = path.resolve("SYSTEM.md");
  return await fs.readFile(filePath, "utf8");
}

function createUiOrchestrator(configPath: string): CortexOrchestrator {
  const orchestrator = new CortexOrchestrator(configPath);
  orchestrator.runner.registerLocal("sales-watcher", salesWatcherAgent);
  orchestrator.runner.registerLocal("content-scanner", contentScannerAgent);
  orchestrator.runner.registerLocal("code-watcher", codeWatcherAgent);
  orchestrator.runner.registerLocal("project-heartbeat", projectHeartbeatAgent);
  orchestrator.runner.registerLocal("fact-extractor", factExtractorAgent);
  orchestrator.runner.registerLocal("memory-synthesizer", memorySynthesizerAgent);
  return orchestrator;
}

async function start(): Promise<void> {
  const systemPrompt = await loadSystemPrompt();
  const orchestratorConfigPath =
    process.env.ORCHESTRATOR_CONFIG_PATH ?? path.resolve("context", "orchestrator.json");
  const terminalSessionManager = new TerminalSessionManager();

  const app = createApp({
    systemPrompt,
    orchestrator: createUiOrchestrator(orchestratorConfigPath),
    terminalSessionManager,
  });
  const port = Number.parseInt(process.env.UI_PORT ?? "8787", 10);

  const httpServer = serve({ fetch: app.fetch, port });
  createTerminalWsServer(httpServer, terminalSessionManager);
  console.log(`Cortex UI listening on http://localhost:${port}`);

  process.on("SIGINT", async () => {
    await terminalSessionManager.dispose();
    process.exit(0);
  });
}

import { fileURLToPath } from "node:url";

const isMain = fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  start().catch((err) => {
    console.error("Failed to start UI server:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
