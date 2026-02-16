/**
 * Telegram Bot CLI Entrypoint
 *
 * Connects Cortex to Telegram via bot polling.
 *
 * Usage:
 *   npm run telegram
 *
 * Required environment variables:
 *   TELEGRAM_BOT_TOKEN
 *   TELEGRAM_ALLOWED_USER_IDS (comma/space-separated Telegram user IDs)
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
import { createTelegramBot, isAllowedUser, readTelegramConfig } from "../integrations/telegram/client.js";
import { formatForTelegram, trimTelegramMessage } from "../integrations/telegram/formatter.js";
import { enqueueTelegramMessage } from "../integrations/telegram/message-queue.js";
import { processTelegramQueueBatch } from "../integrations/telegram/queue-worker.js";

function registerDefaultAgents(orchestrator: CortexOrchestrator): void {
  orchestrator.runner.registerLocal("sales-watcher", salesWatcherAgent);
  orchestrator.runner.registerLocal("content-scanner", contentScannerAgent);
  orchestrator.runner.registerLocal("code-watcher", codeWatcherAgent);
  orchestrator.runner.registerLocal("fact-extractor", factExtractorAgent);
  orchestrator.runner.registerLocal("memory-synthesizer", memorySynthesizerAgent);
}

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
      return;
    }

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

function formatProgressUpdate(lines: readonly string[], done: boolean): string {
  const status = done ? "Cycle complete" : "Running...";
  const header = `**Orchestrator** (${status})`;
  if (lines.length === 0) return header;
  return `${header}\n${lines.join("\n")}`;
}

async function loadSystemPrompt(): Promise<string> {
  const filePath = path.resolve("SYSTEM.md");
  return await fs.readFile(filePath, "utf8");
}

export async function runTelegramBot(): Promise<void> {
  const config = readTelegramConfig();
  const orchestrator = new CortexOrchestrator(config.orchestratorConfigPath);
  registerDefaultAgents(orchestrator);
  const systemPrompt = await loadSystemPrompt();

  const router = new ConfigRouter();
  const bot = createTelegramBot(config);
  const autoProcess = process.env.TELEGRAM_QUEUE_AUTOPROCESS === "true";

  let queueWorkerTimer: ReturnType<typeof setInterval> | undefined;

  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!isAllowedUser(userId, config.allowedUserIds)) return;
    await next();
  });

  if (autoProcess) {
    const pollIntervalMs = normalizePollInterval(process.env.TELEGRAM_QUEUE_POLL_MS);
    const batchSize = normalizeBatchSize(process.env.TELEGRAM_QUEUE_BATCH_SIZE);
    let workerActive = false;

    queueWorkerTimer = setInterval(() => {
      if (workerActive) return;

      workerActive = true;
      void (async () => {
        try {
          const outcomes = await processTelegramQueueBatch({
            router,
            systemPrompt,
            maxTasks: batchSize,
          });
          for (const outcome of outcomes) {
            if (!outcome.refs?.chatId) continue;
            if (outcome.status === "done") {
              await bot.telegram.sendMessage(
                outcome.refs.chatId,
                trimTelegramMessage(
                  formatForTelegram(
                    `Task ${outcome.taskId} (${outcome.result.modelUsed})\n\n${outcome.result.content}`,
                  ),
                ),
                {
                  parse_mode: "HTML",
                },
              );
            } else {
              await bot.telegram.sendMessage(
                outcome.refs.chatId,
                trimTelegramMessage(`Task ${outcome.taskId} failed: ${outcome.error}`),
              );
            }
          }
        } catch (error) {
          console.error(
            "[telegram] Queue worker error:",
            error instanceof Error ? error.message : String(error),
          );
        } finally {
          workerActive = false;
        }
      })();
    }, pollIntervalMs);

    console.log(`[telegram] Queue worker polling every ${pollIntervalMs}ms (batch size ${batchSize})`);
  }

  bot.on("text", async (ctx) => {
    const text = ctx.message.text.trim();
    if (!text) return;

    const intercepted = interceptCommandShortcut(text);
    const interceptedText = intercepted.prompt;
    const orchestrateMatch = interceptedText.match(/^\/orchestrate(?:@\w+)?(?:\s+(.*))?$/i);

    try {
      if (orchestrateMatch) {
        const initial = await ctx.reply("Running orchestrator...");
        const progressLines: string[] = [];
        const throttledUpdate = createThrottle(2000);

        const args = (orchestrateMatch[1] ?? "").trim().split(/\s+/).filter(Boolean);
        args.push("--trigger=cli");

        const summary = await runOrchestrate(args, {
          onEvent: (event) => {
            progressLines.push(formatOrchestratorEvent(event));
            throttledUpdate(async () => {
              try {
                await ctx.telegram.editMessageText(
                  ctx.chat.id,
                  initial.message_id,
                  undefined,
                  trimTelegramMessage(formatForTelegram(formatProgressUpdate(progressLines, false))),
                  { parse_mode: "HTML" },
                );
              } catch {
                // Ignore race edits if message is unchanged/deleted.
              }
            });
          },
        });

        await ctx.telegram.editMessageText(
          ctx.chat.id,
          initial.message_id,
          undefined,
          trimTelegramMessage(formatForTelegram(summary)),
          { parse_mode: "HTML" },
        );
        return;
      }

      const commandResult = await resolveCommand(interceptedText, router);
      if (commandResult) {
        await ctx.reply(
          trimTelegramMessage(formatForTelegram(commandResult.content)),
          { parse_mode: "HTML" },
        );
        return;
      }

      const queued = await enqueueTelegramMessage({
        chatId: ctx.chat.id,
        messageId: ctx.message.message_id,
        text,
        userId: ctx.from?.id,
      });

      await ctx.reply(
        queued.duplicate
          ? `Already captured as ${queued.taskId}: "${queued.preview}"`
          : `Captured (${queued.priority}) as ${queued.taskId}: "${queued.preview}"`,
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[telegram] Error handling message: ${errorMsg}`);
      await ctx.reply(`Error: ${errorMsg}`);
    }
  });

  bot.on("voice", async (ctx) => {
    await ctx.reply("please use Telegram's transcription");
  });

  await bot.launch();
  console.log("[telegram] Cortex Telegram bot connected");
  console.log(`[telegram] Allowed users: ${config.allowedUserIds.join(", ")}`);
  console.log(`[telegram] Mode: ${autoProcess ? "capture + auto-process" : "capture only"}`);

  const shutdown = (signal: "SIGINT" | "SIGTERM"): void => {
    if (queueWorkerTimer) clearInterval(queueWorkerTimer);
    console.log(`[telegram] Shutting down (${signal})...`);
    bot.stop(signal);
    process.exit(0);
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

const isMain = fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  runTelegramBot()
    .catch((err) => {
      console.error(
        "[telegram] Failed to start:",
        err instanceof Error ? err.message : String(err),
      );
      process.exit(1);
    });
}
