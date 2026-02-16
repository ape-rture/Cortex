import { MarkdownTaskQueue } from "../../core/task-queue.js";
import type { Task, TaskPriority, TaskQueue } from "../../core/types/task-queue.js";
import { ConfigRouter } from "../../core/routing.js";
import { resolveCommand } from "../../core/command-registry.js";

export interface TelegramTaskRefs {
  readonly chatId: string;
  readonly messageId?: string;
}

export interface PromptExecutionResult {
  readonly content: string;
  readonly modelUsed: string;
}

export interface ProcessTelegramQueueOptions {
  readonly queue?: TaskQueue;
  readonly router?: ConfigRouter;
  readonly systemPrompt?: string;
  readonly executePrompt?: (prompt: string) => Promise<PromptExecutionResult>;
}

interface TelegramTaskOutcomeBase {
  readonly taskId: string;
  readonly prompt: string;
  readonly refs?: TelegramTaskRefs;
}

export interface ProcessedTelegramTask extends TelegramTaskOutcomeBase {
  readonly status: "done";
  readonly result: PromptExecutionResult;
}

export interface FailedTelegramTask extends TelegramTaskOutcomeBase {
  readonly status: "failed";
  readonly error: string;
}

export type TelegramTaskOutcome = ProcessedTelegramTask | FailedTelegramTask;

export interface ProcessTelegramQueueBatchOptions extends ProcessTelegramQueueOptions {
  readonly maxTasks?: number;
}

function priorityRank(priority: TaskPriority): number {
  switch (priority) {
    case "p0":
      return 0;
    case "p1":
      return 1;
    case "p2":
      return 2;
    case "p3":
      return 3;
    default:
      return 9;
  }
}

function normalizeForSingleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toQueueResultSummary(result: PromptExecutionResult): string {
  const summary = normalizeForSingleLine(result.content);
  const preview = summary.length <= 200 ? summary : `${summary.slice(0, 197)}...`;
  return `model=${result.modelUsed}; response=${preview}`;
}

function pickTelegramTask(tasks: readonly Task[]): Task | undefined {
  const queuedTelegramTasks = tasks
    .filter((task) => task.status === "queued" && task.source === "telegram");
  if (queuedTelegramTasks.length === 0) return undefined;

  queuedTelegramTasks.sort((a, b) => {
    const byPriority = priorityRank(a.priority) - priorityRank(b.priority);
    if (byPriority !== 0) return byPriority;
    return a.created_at.localeCompare(b.created_at);
  });

  return queuedTelegramTasks[0];
}

function parseTelegramContextRef(ref: string): { chatId: string; messageId: string } | null {
  const match = ref.match(/^telegram:([^:]+):(.+)$/);
  if (!match) return null;
  return { chatId: match[1], messageId: match[2] };
}

export function parseTelegramTaskRefs(task: Task): TelegramTaskRefs | undefined {
  const refs = task.context_refs ?? [];
  for (const ref of refs) {
    if (!ref.startsWith("telegram:")) continue;
    const parsed = parseTelegramContextRef(ref);
    if (!parsed) continue;
    return {
      chatId: parsed.chatId,
      messageId: parsed.messageId,
    };
  }
  return undefined;
}

export async function executeTelegramQueuePrompt(
  prompt: string,
  router: ConfigRouter,
  systemPrompt = "",
): Promise<PromptExecutionResult> {
  const commandResult = await resolveCommand(prompt, router);
  if (commandResult) {
    return {
      content: commandResult.content,
      modelUsed: commandResult.modelUsed,
    };
  }

  const response = await router.route({
    prompt,
    ...(systemPrompt.trim().length > 0 ? { system_prompt: systemPrompt } : {}),
  });
  return {
    content: response.content,
    modelUsed: response.model_used,
  };
}

export async function processNextTelegramQueuedTask(
  options: ProcessTelegramQueueOptions = {},
): Promise<TelegramTaskOutcome | null> {
  const queue = options.queue ?? new MarkdownTaskQueue();
  const tasks = await queue.list({ status: "queued" });
  const task = pickTelegramTask(tasks);
  if (!task) return null;

  await queue.update(task.id, "in_progress");
  const prompt = (task.description ?? task.title).trim();
  const refs = parseTelegramTaskRefs(task);
  if (!prompt) {
    const error = "Telegram queue item had no prompt text";
    await queue.update(task.id, "failed", error);
    return {
      status: "failed",
      taskId: task.id,
      prompt,
      refs,
      error,
    };
  }

  const executePrompt = options.executePrompt
    ?? (async (value: string) => {
      const router = options.router ?? new ConfigRouter();
      return await executeTelegramQueuePrompt(value, router, options.systemPrompt);
    });

  try {
    const result = await executePrompt(prompt);
    await queue.update(task.id, "done", toQueueResultSummary(result));

    return {
      status: "done",
      taskId: task.id,
      prompt,
      refs,
      result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const normalized = normalizeForSingleLine(message);
    await queue.update(task.id, "failed", normalized);
    return {
      status: "failed",
      taskId: task.id,
      prompt,
      refs,
      error: normalized,
    };
  }
}

export async function processTelegramQueueBatch(
  options: ProcessTelegramQueueBatchOptions = {},
): Promise<readonly TelegramTaskOutcome[]> {
  const maxTasks = Math.max(1, options.maxTasks ?? 1);
  const outcomes: TelegramTaskOutcome[] = [];

  for (let i = 0; i < maxTasks; i += 1) {
    const outcome = await processNextTelegramQueuedTask(options);
    if (!outcome) break;
    outcomes.push(outcome);
  }

  return outcomes;
}
