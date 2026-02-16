import { MarkdownTaskQueue } from "../../core/task-queue.js";
import type { Task, TaskPriority, TaskQueue } from "../../core/types/task-queue.js";
import { ConfigRouter } from "../../core/routing.js";
import { resolveCommand } from "../../core/command-registry.js";

export interface SlackTaskRefs {
  readonly channelId: string;
  readonly messageTs?: string;
  readonly threadTs?: string;
}

export interface PromptExecutionResult {
  readonly content: string;
  readonly modelUsed: string;
}

export interface ProcessSlackQueueOptions {
  readonly queue?: TaskQueue;
  readonly router?: ConfigRouter;
  readonly systemPrompt?: string;
  readonly executePrompt?: (prompt: string) => Promise<PromptExecutionResult>;
}

interface SlackTaskOutcomeBase {
  readonly taskId: string;
  readonly prompt: string;
  readonly refs?: SlackTaskRefs;
}

export interface ProcessedSlackTask extends SlackTaskOutcomeBase {
  readonly status: "done";
  readonly result: PromptExecutionResult;
}

export interface FailedSlackTask extends SlackTaskOutcomeBase {
  readonly status: "failed";
  readonly error: string;
}

export type SlackTaskOutcome = ProcessedSlackTask | FailedSlackTask;

export interface ProcessSlackQueueBatchOptions extends ProcessSlackQueueOptions {
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

function pickSlackTask(tasks: readonly Task[]): Task | undefined {
  const queuedSlackTasks = tasks
    .filter((task) => task.status === "queued" && task.source === "slack");
  if (queuedSlackTasks.length === 0) return undefined;

  queuedSlackTasks.sort((a, b) => {
    const byPriority = priorityRank(a.priority) - priorityRank(b.priority);
    if (byPriority !== 0) return byPriority;
    return a.created_at.localeCompare(b.created_at);
  });

  return queuedSlackTasks[0];
}

function parseSlackContextRef(ref: string, prefix: "slack" | "slack-thread"): { channelId: string; ts: string } | null {
  const match = ref.match(new RegExp(`^${prefix}:([^:]+):(.+)$`));
  if (!match) return null;
  return { channelId: match[1], ts: match[2] };
}

export function parseSlackTaskRefs(task: Task): SlackTaskRefs | undefined {
  const refs = task.context_refs ?? [];
  let messageRef: { channelId: string; ts: string } | null = null;
  let threadRef: { channelId: string; ts: string } | null = null;

  for (const ref of refs) {
    if (!messageRef && ref.startsWith("slack:")) {
      messageRef = parseSlackContextRef(ref, "slack");
      continue;
    }
    if (!threadRef && ref.startsWith("slack-thread:")) {
      threadRef = parseSlackContextRef(ref, "slack-thread");
    }
  }

  const channelId = threadRef?.channelId ?? messageRef?.channelId;
  if (!channelId) return undefined;

  return {
    channelId,
    messageTs: messageRef?.ts,
    threadTs: threadRef?.ts,
  };
}

export async function executeSlackQueuePrompt(
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

export async function processNextSlackQueuedTask(
  options: ProcessSlackQueueOptions = {},
): Promise<SlackTaskOutcome | null> {
  const queue = options.queue ?? new MarkdownTaskQueue();
  const tasks = await queue.list({ status: "queued" });
  const task = pickSlackTask(tasks);
  if (!task) return null;

  await queue.update(task.id, "in_progress");
  const prompt = (task.description ?? task.title).trim();
  const refs = parseSlackTaskRefs(task);
  if (!prompt) {
    const error = "Slack queue item had no prompt text";
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
      return await executeSlackQueuePrompt(value, router, options.systemPrompt);
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

export async function processSlackQueueBatch(
  options: ProcessSlackQueueBatchOptions = {},
): Promise<readonly SlackTaskOutcome[]> {
  const maxTasks = Math.max(1, options.maxTasks ?? 1);
  const outcomes: SlackTaskOutcome[] = [];

  for (let i = 0; i < maxTasks; i += 1) {
    const outcome = await processNextSlackQueuedTask(options);
    if (!outcome) break;
    outcomes.push(outcome);
  }

  return outcomes;
}
