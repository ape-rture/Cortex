import { promises as fs } from "node:fs";
import path from "node:path";
import { parseTaskQueue, serializeTaskQueue } from "../utils/markdown.js";
import type { Task, TaskPriority, TaskQueue, TaskStatus } from "./types/task-queue.js";

const DEFAULT_QUEUE_PATH = path.resolve("actions", "queue.md");

function nowIso(): string {
  return new Date().toISOString();
}

function generateTaskId(title: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return `task-${timestamp}-${slug || "item"}`;
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

export class MarkdownTaskQueue implements TaskQueue {
  private readonly queuePath: string;

  constructor(queuePath: string = DEFAULT_QUEUE_PATH) {
    this.queuePath = queuePath;
  }

  async list(filter?: { status?: TaskStatus; priority?: TaskPriority }): Promise<readonly Task[]> {
    const tasks = await this.readAll();
    return tasks.filter((task) => {
      if (filter?.status && task.status !== filter.status) return false;
      if (filter?.priority && task.priority !== filter.priority) return false;
      return true;
    });
  }

  async add(task: Omit<Task, "id" | "status" | "created_at" | "updated_at">): Promise<string> {
    const tasks = await this.readAll();
    const createdAt = nowIso();
    const newTask: Task = {
      ...task,
      id: generateTaskId(task.title),
      status: "queued",
      created_at: createdAt,
      updated_at: createdAt,
    };
    tasks.push(newTask);
    await this.writeAll(tasks);
    return newTask.id;
  }

  async update(id: string, status: TaskStatus, result?: string): Promise<void> {
    const tasks = await this.readAll();
    const task = tasks.find((item) => item.id === id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }
    task.status = status;
    task.updated_at = nowIso();
    if (result) task.result = result;
    await this.writeAll(tasks);
  }

  async next(): Promise<Task | undefined> {
    const tasks = await this.readAll();
    const queued = tasks.filter((task) => task.status === "queued");
    if (queued.length === 0) return undefined;
    queued.sort((a, b) => {
      const rankDiff = priorityRank(a.priority) - priorityRank(b.priority);
      if (rankDiff !== 0) return rankDiff;
      return a.created_at.localeCompare(b.created_at);
    });
    return queued[0];
  }

  parseFromMarkdown(content: string): Task[] {
    return parseTaskQueue(content);
  }

  toMarkdown(tasks: readonly Task[]): string {
    return serializeTaskQueue(tasks);
  }

  private async readAll(): Promise<Task[]> {
    try {
      const raw = await fs.readFile(this.queuePath, "utf8");
      return this.parseFromMarkdown(raw);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw err;
    }
  }

  private async writeAll(tasks: readonly Task[]): Promise<void> {
    const content = this.toMarkdown(tasks);
    await fs.writeFile(this.queuePath, content, "utf8");
  }
}
