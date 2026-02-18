import { promises as fs } from "node:fs";
import path from "node:path";
import type { ResearchItem, ResearchStatus, ResearchStore } from "./types/capture.js";
import { parseResearchQueue, serializeResearchQueue } from "../utils/markdown.js";

const DEFAULT_RESEARCH_PATH = path.resolve("actions", "research-queue.md");

type ResearchStorePaths = {
  researchPath: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function toResearchId(index: number): string {
  return `research-${String(index).padStart(3, "0")}`;
}

function nextResearchId(items: readonly ResearchItem[]): string {
  const max = items.reduce((current, item) => {
    const match = item.id.match(/^research-(\d+)$/);
    if (!match) return current;
    const value = Number.parseInt(match[1], 10);
    return Number.isFinite(value) ? Math.max(current, value) : current;
  }, 0);
  return toResearchId(max + 1);
}

export class MarkdownResearchStore implements ResearchStore {
  private readonly paths: ResearchStorePaths;

  constructor(paths?: Partial<ResearchStorePaths>) {
    this.paths = {
      researchPath: paths?.researchPath ?? DEFAULT_RESEARCH_PATH,
    };
  }

  async load(): Promise<readonly ResearchItem[]> {
    try {
      const raw = await fs.readFile(this.paths.researchPath, "utf8");
      return parseResearchQueue(raw);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }

  async save(items: readonly ResearchItem[]): Promise<void> {
    await fs.mkdir(path.dirname(this.paths.researchPath), { recursive: true });
    await fs.writeFile(this.paths.researchPath, serializeResearchQueue(items), "utf8");
  }

  async add(item: Omit<ResearchItem, "id" | "capturedAt" | "updatedAt">): Promise<string> {
    const items = await this.load();
    const timestamp = nowIso();
    const next: ResearchItem = {
      ...item,
      id: nextResearchId(items),
      capturedAt: timestamp,
      updatedAt: timestamp,
    };
    await this.save([...items, next]);
    return next.id;
  }

  async updateStatus(id: string, status: ResearchStatus, result?: string): Promise<void> {
    const items = await this.load();
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new Error(`Research item not found: ${id}`);
    }

    const timestamp = nowIso();
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      status,
      result: result ?? updated[index].result,
      updatedAt: timestamp,
    };
    await this.save(updated);
  }

  async listByStatus(status: ResearchStatus): Promise<readonly ResearchItem[]> {
    const items = await this.load();
    return items.filter((item) => item.status === status);
  }
}
