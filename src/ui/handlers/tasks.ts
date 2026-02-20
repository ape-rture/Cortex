import { promises as fs } from "node:fs";
import type { Hono } from "hono";

export type TaskStatus = "queued" | "in_progress" | "done";

export interface TaskItem {
  readonly title: string;
  readonly status: TaskStatus;
  readonly agent?: string;
}

export interface BoardTask extends TaskItem {
  readonly group?: string;
  readonly branch?: string;
  readonly description?: string;
  readonly rawLine: string;
  readonly lineNumber: number;
}

export interface ParsedBoardSection {
  readonly status: TaskStatus;
  readonly tasks: readonly BoardTask[];
}

export interface ParsedBoard {
  readonly sections: readonly ParsedBoardSection[];
  readonly tasks: readonly BoardTask[];
  readonly raw: string;
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

const TASK_LINE_REGEX =
  /^-\s+\*\*(.+?)\*\*(?:\s+--\s+Agent:\s*(\w+))?(?:\s+--\s+Branch:\s*`?([^`.]+)`?)?(?:\.\s*(.*))?/i;

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase();
}

function parseTaskLine(
  line: string,
  status: TaskStatus,
  group: string | undefined,
  lineNumber: number,
): BoardTask | null {
  const match = line.match(TASK_LINE_REGEX);
  if (!match?.[1]) return null;

  const title = match[1].trim();
  if (!title) return null;
  const agent = match[2]?.trim().toLowerCase();
  const branch = match[3]?.trim();
  const description = match[4]?.trim();

  return {
    title,
    status,
    rawLine: line,
    lineNumber,
    ...(group ? { group } : {}),
    ...(agent ? { agent } : {}),
    ...(branch ? { branch } : {}),
    ...(description ? { description } : {}),
  };
}

export function parseFullBoard(markdown: string): ParsedBoard {
  const sectionsMap: Record<TaskStatus, BoardTask[]> = {
    queued: [],
    in_progress: [],
    done: [],
  };
  const sectionOrder: TaskStatus[] = [];
  const tasks: BoardTask[] = [];
  const lines = markdown.split(/\r?\n/);
  let current: TaskStatus | undefined;
  let currentGroup: string | undefined;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const heading = line.match(/^##\s+(.+)\s*$/i)?.[1]?.trim().toLowerCase();
    if (heading) {
      current = HEADING_STATUS[heading];
      currentGroup = undefined;
      if (current && !sectionOrder.includes(current)) sectionOrder.push(current);
      continue;
    }

    const group = line.match(/^###\s+(.+)\s*$/i)?.[1]?.trim();
    if (group && current) {
      currentGroup = group;
      continue;
    }

    if (!current) continue;

    const item = parseTaskLine(line, current, currentGroup, i + 1);
    if (item) {
      sectionsMap[current].push(item);
      tasks.push(item);
    }
  }

  const sections: ParsedBoardSection[] = (sectionOrder.length > 0
    ? sectionOrder
    : (Object.keys(sectionsMap) as TaskStatus[]))
    .map((status) => ({
      status,
      tasks: sectionsMap[status],
    }));

  return {
    sections,
    tasks,
    raw: markdown,
  };
}

export function findTaskByTitle(
  board: ParsedBoard,
  title: string,
  status?: TaskStatus,
): BoardTask | undefined {
  const normalized = normalizeTitle(title);
  return board.tasks.find((task) => {
    if (status && task.status !== status) return false;
    return normalizeTitle(task.title) === normalized;
  });
}

function getSectionBounds(lines: readonly string[], status: TaskStatus): { start: number; end: number } | null {
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const heading = lines[i]?.match(/^##\s+(.+)\s*$/i)?.[1]?.trim().toLowerCase();
    if (!heading) continue;
    if (HEADING_STATUS[heading] === status) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;

  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i] ?? "")) {
      return { start, end: i };
    }
  }
  return { start, end: lines.length };
}

function findTaskLineIndexInSection(
  lines: readonly string[],
  title: string,
  status: TaskStatus,
): number {
  const bounds = getSectionBounds(lines, status);
  if (!bounds) return -1;

  const normalized = normalizeTitle(title);
  for (let i = bounds.start + 1; i < bounds.end; i += 1) {
    const parsed = parseTaskLine(lines[i] ?? "", status, undefined, i + 1);
    if (!parsed) continue;
    if (normalizeTitle(parsed.title) === normalized) return i;
  }
  return -1;
}

function firstInsertIndex(lines: readonly string[], status: TaskStatus): number {
  const bounds = getSectionBounds(lines, status);
  if (!bounds) return lines.length;

  let index = bounds.start + 1;
  while (index < bounds.end && (lines[index] ?? "").trim() === "") {
    index += 1;
  }
  return index;
}

export function moveTaskOnBoard(
  markdown: string,
  taskTitle: string,
  from: TaskStatus,
  to: TaskStatus,
  annotation?: string,
): string {
  const lines = markdown.split(/\r?\n/);
  const fromIndex = findTaskLineIndexInSection(lines, taskTitle, from);
  if (fromIndex < 0) return markdown;

  const [taskLine] = lines.splice(fromIndex, 1);
  const note = annotation?.trim();
  const movedLine = note ? `${taskLine} ${note}` : taskLine;

  const insertIndex = firstInsertIndex(lines, to);
  lines.splice(insertIndex, 0, movedLine);

  return lines.join("\n");
}

export function parseTaskBoard(markdown: string): TaskSummary {
  const board = parseFullBoard(markdown);
  const items: TaskItem[] = board.tasks.map((task) => ({
    title: task.title,
    status: task.status,
    ...(task.agent ? { agent: task.agent } : {}),
  }));

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
