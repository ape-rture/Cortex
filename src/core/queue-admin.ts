import type { Task, TaskQueue, TaskStatus } from "./types/task-queue.js";

interface QueueStatusCounts {
  queued: number;
  in_progress: number;
  done: number;
  failed: number;
  blocked: number;
  cancelled: number;
}

interface QueueSummary {
  total: number;
  all: QueueStatusCounts;
  slack: QueueStatusCounts;
  telegram: QueueStatusCounts;
}

type QueueTaskSource = "slack" | "telegram";

const RETRYABLE_STATUSES = new Set<TaskStatus>(["failed", "blocked", "cancelled"]);

function emptyCounts(): QueueStatusCounts {
  return {
    queued: 0,
    in_progress: 0,
    done: 0,
    failed: 0,
    blocked: 0,
    cancelled: 0,
  };
}

function countByStatus(tasks: readonly Task[]): QueueStatusCounts {
  const counts = emptyCounts();
  for (const task of tasks) {
    counts[task.status] += 1;
  }
  return counts;
}

function normalizeLimit(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 50);
}

function retryable(task: Task): boolean {
  return RETRYABLE_STATUSES.has(task.status);
}

function formatStatusLine(label: string, counts: QueueStatusCounts): string {
  return `- ${label}: queued=${counts.queued}, in_progress=${counts.in_progress}, failed=${counts.failed}, blocked=${counts.blocked}, done=${counts.done}, cancelled=${counts.cancelled}`;
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export async function summarizeQueue(queue: TaskQueue): Promise<QueueSummary> {
  const tasks = await queue.list();
  const slackTasks = tasks.filter((task) => task.source === "slack");
  const telegramTasks = tasks.filter((task) => task.source === "telegram");
  return {
    total: tasks.length,
    all: countByStatus(tasks),
    slack: countByStatus(slackTasks),
    telegram: countByStatus(telegramTasks),
  };
}

export function formatQueueSummary(summary: QueueSummary): string {
  return [
    "# Queue Status",
    "",
    `Total tasks: ${summary.total}`,
    "",
    formatStatusLine("All", summary.all),
    formatStatusLine("Slack", summary.slack),
    formatStatusLine("Telegram", summary.telegram),
  ].join("\n");
}

function formatSourceLabel(source: QueueTaskSource): string {
  return source[0].toUpperCase() + source.slice(1);
}

export async function listFailedSourceTasks(
  queue: TaskQueue,
  options?: { limit?: number; source?: QueueTaskSource },
): Promise<string> {
  const source = options?.source ?? "slack";
  const all = await queue.list();
  const failed = all
    .filter((task) => task.source === source && task.status === "failed")
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  if (failed.length === 0) {
    return `No failed ${formatSourceLabel(source)} queue tasks.`;
  }

  const limit = options?.limit ?? 10;
  const selected = failed.slice(0, limit);
  const lines = [`# Failed ${formatSourceLabel(source)} Queue Tasks (${selected.length}/${failed.length})`, ""];
  for (const task of selected) {
    const result = task.result ? oneLine(task.result) : "(no error message)";
    lines.push(`- ${task.id} | ${task.priority} | ${task.updated_at}`);
    lines.push(`  ${task.title}`);
    lines.push(`  Error: ${result}`);
  }
  return lines.join("\n");
}

export async function listFailedSlackTasks(
  queue: TaskQueue,
  options?: { limit?: number },
): Promise<string> {
  return await listFailedSourceTasks(queue, {
    limit: options?.limit,
    source: "slack",
  });
}

export async function listFailedTelegramTasks(
  queue: TaskQueue,
  options?: { limit?: number },
): Promise<string> {
  return await listFailedSourceTasks(queue, {
    limit: options?.limit,
    source: "telegram",
  });
}

export async function retryQueueTaskById(
  queue: TaskQueue,
  taskId: string,
): Promise<string> {
  const all = await queue.list();
  const task = all.find((item) => item.id === taskId);
  if (!task) {
    return `Task not found: ${taskId}`;
  }
  if (!retryable(task)) {
    return `Task ${taskId} is ${task.status}; only failed/blocked/cancelled tasks can be retried.`;
  }

  await queue.update(task.id, "queued", `Retry requested at ${new Date().toISOString()}`);
  return `Requeued ${task.id} (${task.source})`;
}

export async function retryFailedSourceTasks(
  queue: TaskQueue,
  source: QueueTaskSource = "slack",
): Promise<string> {
  const all = await queue.list();
  const retryCandidates = all.filter((task) => task.source === source && retryable(task));
  if (retryCandidates.length === 0) {
    return `No retryable ${formatSourceLabel(source)} tasks found.`;
  }

  for (const task of retryCandidates) {
    await queue.update(task.id, "queued", `Retry requested at ${new Date().toISOString()}`);
  }

  return `Requeued ${retryCandidates.length} ${formatSourceLabel(source)} task(s).`;
}

export async function retryFailedSlackTasks(
  queue: TaskQueue,
): Promise<string> {
  return await retryFailedSourceTasks(queue, "slack");
}

export async function retryFailedTelegramTasks(
  queue: TaskQueue,
): Promise<string> {
  return await retryFailedSourceTasks(queue, "telegram");
}

export function parseQueueLimitArg(raw: string | undefined, fallback = 10): number {
  return normalizeLimit(raw, fallback);
}
