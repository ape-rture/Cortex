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
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CortexOrchestrator } from "../core/orchestrator.js";
import { ConfigRouter } from "../core/routing.js";
import { interceptCommandShortcut } from "../core/command-interceptor.js";
import { resolveCommand, formatOrchestratorEvent } from "../core/command-registry.js";
import { runOrchestrate } from "./orchestrate.js";
import { salesWatcherAgent } from "../agents/sales-watcher.js";
import { contentScannerAgent } from "../agents/content-scanner.js";
import { codeWatcherAgent } from "../agents/code-watcher.js";
import { factExtractorAgent } from "../agents/fact-extractor.js";
import { memorySynthesizerAgent } from "../agents/memory-synthesizer.js";
import { telegramTriageAgent } from "../agents/telegram-triage.js";
import { createSlackApp, readSlackConfig } from "../integrations/slack/client.js";
import { formatForSlack, formatProgressUpdate } from "../integrations/slack/formatter.js";
import { enqueueSlackMessage } from "../integrations/slack/message-queue.js";
import { processSlackQueueBatch } from "../integrations/slack/queue-worker.js";

// ---------------------------------------------------------------------------
// Orchestrator setup (same pattern as daemon.ts)
// ---------------------------------------------------------------------------

function registerDefaultAgents(orchestrator: CortexOrchestrator): void {
  orchestrator.runner.registerLocal("sales-watcher", salesWatcherAgent);
  orchestrator.runner.registerLocal("content-scanner", contentScannerAgent);
  orchestrator.runner.registerLocal("code-watcher", codeWatcherAgent);
  orchestrator.runner.registerLocal("fact-extractor", factExtractorAgent);
  orchestrator.runner.registerLocal("memory-synthesizer", memorySynthesizerAgent);
  orchestrator.runner.registerLocal("telegram-triage", telegramTriageAgent);
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

function normalizePollInterval(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 4000;
  return parsed;
}

function normalizeBatchSize(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.min(parsed, 10);
}

function trimSlackMessage(value: string, maxLength = 3500): string {
  const normalized = value.trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3)}...`;
}

async function loadSystemPrompt(): Promise<string> {
  const filePath = path.resolve("SYSTEM.md");
  return await fs.readFile(filePath, "utf8");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function runSlackBot(): Promise<void> {
  const config = readSlackConfig();
  const orchestrator = new CortexOrchestrator(config.orchestratorConfigPath);
  registerDefaultAgents(orchestrator);
  const systemPrompt = await loadSystemPrompt();

  const router = new ConfigRouter();
  const app = createSlackApp(config);
  const autoProcess = process.env.SLACK_QUEUE_AUTOPROCESS === "true";

  let queueWorkerTimer: ReturnType<typeof setInterval> | undefined;

  if (autoProcess) {
    const pollIntervalMs = normalizePollInterval(process.env.SLACK_QUEUE_POLL_MS);
    const batchSize = normalizeBatchSize(process.env.SLACK_QUEUE_BATCH_SIZE);
    let workerActive = false;

    queueWorkerTimer = setInterval(() => {
      if (workerActive) return;

      workerActive = true;
      void (async () => {
        try {
          const outcomes = await processSlackQueueBatch({
            router,
            systemPrompt,
            maxTasks: batchSize,
          });
          for (const outcome of outcomes) {
            if (!outcome.refs?.channelId) continue;

            const threadTs = outcome.refs.threadTs ?? outcome.refs.messageTs;
            if (outcome.status === "done") {
              await app.client.chat.postMessage({
                channel: outcome.refs.channelId,
                thread_ts: threadTs,
                text: trimSlackMessage(
                  formatForSlack(
                    `Task ${outcome.taskId} (${outcome.result.modelUsed})\n\n${outcome.result.content}`,
                  ),
                ),
              });
            } else {
              await app.client.chat.postMessage({
                channel: outcome.refs.channelId,
                thread_ts: threadTs,
                text: trimSlackMessage(`Task ${outcome.taskId} failed: ${outcome.error}`),
              });
            }
          }
        } catch (error) {
          console.error(
            "[slack] Queue worker error:",
            error instanceof Error ? error.message : String(error),
          );
        } finally {
          workerActive = false;
        }
      })();
    }, pollIntervalMs);

    console.log(`[slack] Queue worker polling every ${pollIntervalMs}ms (batch size ${batchSize})`);
  }

  // Listen to messages in #cortex channel and DMs
  app.message(async ({ message, say, client }) => {
    const msg = message as {
      channel: string;
      channel_type?: string;
      subtype?: string;
      text?: string;
      ts: string;
      thread_ts?: string;
      user?: string;
    };
    // Accept #cortex channel OR direct messages to the bot
    const isDM = msg.channel_type === "im" || msg.channel.startsWith("D");
    if (msg.channel !== config.cortexChannelId && !isDM) return;
    if (msg.subtype) return; // ignore edits, joins, bot messages, etc.

    const text = msg.text?.trim();
    if (!text) return;
    const intercepted = interceptCommandShortcut(text);
    const interceptedText = intercepted.prompt;
    const responseThreadTs = msg.thread_ts ?? msg.ts;

    try {
      // Special case: /orchestrate with progress streaming
      const orchestrateMatch = interceptedText.match(/^\/orchestrate(?:\s+(.*))?$/i);
      if (orchestrateMatch) {
        const initial = await say({
          text: "Running orchestrator...",
          thread_ts: responseThreadTs,
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
      const commandResult = await resolveCommand(interceptedText, router);
      if (commandResult) {
        await say({
          text: formatForSlack(commandResult.content),
          thread_ts: responseThreadTs,
        });
        return;
      }

      // Natural language -> capture as task queue item
      const queued = await enqueueSlackMessage({
        channelId: msg.channel,
        messageTs: msg.ts,
        threadTs: msg.thread_ts,
        text,
        userId: msg.user,
      });

      await say({
        text: queued.duplicate
          ? `Already captured as ${queued.taskId}: "${queued.preview}"`
          : `Captured (${queued.priority}) as ${queued.taskId}: "${queued.preview}"`,
        thread_ts: responseThreadTs,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[slack] Error handling message: ${errorMsg}`);
      await say({
        text: `Error: ${errorMsg}`,
        thread_ts: responseThreadTs,
      });
    }
  });

  await app.start();
  console.log("[slack] Cortex Slack bot connected via Socket Mode");
  console.log(`[slack] Listening in channel: ${config.cortexChannelId}`);
  console.log(`[slack] Mode: ${autoProcess ? "capture + auto-process" : "capture only"}`);

  const shutdown = () => {
    if (queueWorkerTimer) clearInterval(queueWorkerTimer);
    console.log("[slack] Shutting down...");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// ---------------------------------------------------------------------------
// Direct execution
// ---------------------------------------------------------------------------

const isMain = fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  runSlackBot()
    .catch((err) => {
      console.error("[slack] Failed to start:", err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
