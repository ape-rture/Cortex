import { promises as fs } from "node:fs";
import type { Hono } from "hono";

export type TaskStatus = "queued" | "in_progress" | "done";

export interface TaskItem {
  readonly title: string;
  readonly status: TaskStatus;
  readonly agent?: string;
}

export interface TaskSummary {
  readonly queued: number;
  readonly in_progress: number;
  readonly done: number;
  readonly items: readonly TaskItem[];
}

const HEADING_STATUS: Record<string, TaskStatus | undefined> = {
  queued: "queued",
  "in progress": "in_progress",
  done: "done",
};

const TASK_LINE_REGEX = /^-\s+\*\*(.+?)\*\*(?:\s+--\s+Agent:\s*([^.\n]+))?/i;

function parseTaskLine(line: string, status: TaskStatus): TaskItem | null {
  const match = line.match(TASK_LINE_REGEX);
  if (!match?.[1]) return null;

  const title = match[1].trim();
  if (!title) return null;
  const agent = match[2]?.trim();

  return {
    title,
    status,
    ...(agent ? { agent } : {}),
  };
}

export function parseTaskBoard(markdown: string): TaskSummary {
  const items: TaskItem[] = [];
  const lines = markdown.split(/\r?\n/);
  let current: TaskStatus | undefined;

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+)\s*$/i)?.[1]?.trim().toLowerCase();
    if (heading) {
      current = HEADING_STATUS[heading];
      continue;
    }
    if (!current) continue;

    const item = parseTaskLine(line, current);
    if (item) {
      items.push(item);
    }
  }

  const queued = items.filter((item) => item.status === "queued").length;
  const in_progress = items.filter((item) => item.status === "in_progress").length;
  const done = items.filter((item) => item.status === "done").length;

  return { queued, in_progress, done, items };
}

export async function loadTaskSummary(taskBoardPath: string): Promise<TaskSummary> {
  try {
    const raw = await fs.readFile(taskBoardPath, "utf8");
    return parseTaskBoard(raw);
  } catch {
    return {
      queued: 0,
      in_progress: 0,
      done: 0,
      items: [],
    };
  }
}

export function registerTaskHandlers(app: Hono, taskBoardPath: string): void {
  app.get("/api/tasks", async (c) => {
    const summary = await loadTaskSummary(taskBoardPath);
    return c.json(summary);
  });
}
