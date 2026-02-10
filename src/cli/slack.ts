/**
 * Slack Bot CLI Entrypoint
 *
 * Connects Cortex to a Slack #cortex channel via Socket Mode.
 * Reuses the shared command registry for command parity with the web terminal.
 *
 * Usage:
 *   npm run slack
 *
 * Required environment variables:
 *   SLACK_BOT_TOKEN        - Bot OAuth token (xoxb-...)
 *   SLACK_APP_TOKEN        - App-level token for Socket Mode (xapp-...)
 *   SLACK_CORTEX_CHANNEL_ID - Channel ID for #cortex
 */

import "dotenv/config";
import { fileURLToPath } from "node:url";
import { CortexOrchestrator } from "../core/orchestrator.js";
import { ConfigRouter } from "../core/routing.js";
import { MarkdownTaskQueue } from "../core/task-queue.js";
import { resolveCommand, formatOrchestratorEvent } from "../core/command-registry.js";
import { runOrchestrate } from "./orchestrate.js";
import { salesWatcherAgent } from "../agents/sales-watcher.js";
import { contentScannerAgent } from "../agents/content-scanner.js";
import { codeWatcherAgent } from "../agents/code-watcher.js";
import { factExtractorAgent } from "../agents/fact-extractor.js";
import { memorySynthesizerAgent } from "../agents/memory-synthesizer.js";
import { createSlackApp, readSlackConfig } from "../integrations/slack/client.js";
import { formatForSlack, formatProgressUpdate } from "../integrations/slack/formatter.js";

// ---------------------------------------------------------------------------
// Orchestrator setup (same pattern as daemon.ts)
// ---------------------------------------------------------------------------

function registerDefaultAgents(orchestrator: CortexOrchestrator): void {
  orchestrator.runner.registerLocal("sales-watcher", salesWatcherAgent);
  orchestrator.runner.registerLocal("content-scanner", contentScannerAgent);
  orchestrator.runner.registerLocal("code-watcher", codeWatcherAgent);
  orchestrator.runner.registerLocal("fact-extractor", factExtractorAgent);
  orchestrator.runner.registerLocal("memory-synthesizer", memorySynthesizerAgent);
}

// ---------------------------------------------------------------------------
// Throttle helper for Slack message updates
// ---------------------------------------------------------------------------

function createThrottle(intervalMs: number): (fn: () => Promise<void>) => void {
  let lastCall = 0;
  let pending: (() => Promise<void>) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  return (fn) => {
    const now = Date.now();
    const elapsed = now - lastCall;

    if (elapsed >= intervalMs) {
      lastCall = now;
      void fn();
    } else {
      // Queue the latest update, replacing any previous pending one
      pending = fn;
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          if (pending) {
            lastCall = Date.now();
            void pending();
            pending = null;
          }
        }, intervalMs - elapsed);
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function runSlackBot(): Promise<void> {
  const config = readSlackConfig();
  const orchestrator = new CortexOrchestrator(config.orchestratorConfigPath);
  registerDefaultAgents(orchestrator);

  const router = new ConfigRouter();
  const app = createSlackApp(config);

  // Listen to messages in #cortex channel
  app.message(async ({ message, say, client }) => {
    // Only respond in #cortex
    const msg = message as { channel: string; subtype?: string; text?: string; ts: string; user?: string };
    if (msg.channel !== config.cortexChannelId) return;
    if (msg.subtype) return; // ignore edits, joins, bot messages, etc.

    const text = msg.text?.trim();
    if (!text) return;

    try {
      // Special case: /orchestrate with progress streaming
      const orchestrateMatch = text.match(/^\/orchestrate(?:\s+(.*))?$/i);
      if (orchestrateMatch) {
        const initial = await say({
          text: "Running orchestrator...",
          thread_ts: msg.ts,
        });

        const progressLines: string[] = [];
        const throttledUpdate = createThrottle(2000);
        const channelId = msg.channel;
        const messageTs = initial.ts!;

        const args = (orchestrateMatch[1] ?? "").trim().split(/\s+/).filter(Boolean);
        args.push("--trigger=slack");

        const summary = await runOrchestrate(args, {
          onEvent: (event) => {
            progressLines.push(formatOrchestratorEvent(event));
            throttledUpdate(async () => {
              await client.chat.update({
                channel: channelId,
                ts: messageTs,
                text: formatProgressUpdate(progressLines, false),
              });
            });
          },
        });

        // Final update with complete results
        await client.chat.update({
          channel: channelId,
          ts: messageTs,
          text: formatForSlack(summary),
        });
        return;
      }

      // Try shared command resolution
      const commandResult = await resolveCommand(text, router);
      if (commandResult) {
        await say({
          text: formatForSlack(commandResult.content),
          thread_ts: msg.ts,
        });
        return;
      }

      // Natural language -> capture as task queue item
      const taskQueue = new MarkdownTaskQueue();
      await taskQueue.add({
        title: text.slice(0, 120),
        description: text.length > 120 ? text : undefined,
        priority: "p2",
        source: "slack",
      });

      await say({
        text: `Captured to task queue: "${text.slice(0, 80)}${text.length > 80 ? "..." : ""}"`,
        thread_ts: msg.ts,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[slack] Error handling message: ${errorMsg}`);
      await say({
        text: `Error: ${errorMsg}`,
        thread_ts: msg.ts,
      });
    }
  });

  await app.start();
  console.log("[slack] Cortex Slack bot connected via Socket Mode");
  console.log(`[slack] Listening in channel: ${config.cortexChannelId}`);
}

// ---------------------------------------------------------------------------
// Direct execution
// ---------------------------------------------------------------------------

const isMain = fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  runSlackBot()
    .then(() => {
      const shutdown = () => {
        console.log("[slack] Shutting down...");
        process.exit(0);
      };

      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    })
    .catch((err) => {
      console.error("[slack] Failed to start:", err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
