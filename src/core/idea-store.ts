import { promises as fs } from "node:fs";
import path from "node:path";
import type { IdeaStore, ProjectSeed, SeedStatus } from "./types/capture.js";
import { parseProjectSeeds, serializeProjectSeeds } from "../utils/markdown.js";

const DEFAULT_IDEA_PATH = path.resolve("projects", "ideas.md");

type IdeaStorePaths = {
  ideaPath: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function toIdeaId(index: number): string {
  return `seed-${String(index).padStart(3, "0")}`;
}

function nextIdeaId(items: readonly ProjectSeed[]): string {
  const max = items.reduce((current, item) => {
    const match = item.id.match(/^seed-(\d+)$/);
    if (!match) return current;
    const value = Number.parseInt(match[1], 10);
    return Number.isFinite(value) ? Math.max(current, value) : current;
  }, 0);
  return toIdeaId(max + 1);
}

export class MarkdownIdeaStore implements IdeaStore {
  private readonly paths: IdeaStorePaths;

  constructor(paths?: Partial<IdeaStorePaths>) {
    this.paths = {
      ideaPath: paths?.ideaPath ?? DEFAULT_IDEA_PATH,
    };
  }

  async load(): Promise<readonly ProjectSeed[]> {
    try {
      const raw = await fs.readFile(this.paths.ideaPath, "utf8");
      return parseProjectSeeds(raw);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }

  async save(items: readonly ProjectSeed[]): Promise<void> {
    await fs.mkdir(path.dirname(this.paths.ideaPath), { recursive: true });
    await fs.writeFile(this.paths.ideaPath, serializeProjectSeeds(items), "utf8");
  }

  async add(item: Omit<ProjectSeed, "id" | "capturedAt" | "updatedAt">): Promise<string> {
    const items = await this.load();
    const timestamp = nowIso();
    const next: ProjectSeed = {
      ...item,
      id: nextIdeaId(items),
      capturedAt: timestamp,
      updatedAt: timestamp,
    };
    await this.save([...items, next]);
    return next.id;
  }

  async updateStatus(id: string, status: SeedStatus): Promise<void> {
    const items = await this.load();
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new Error(`Project seed not found: ${id}`);
    }

    const updated = [...items];
    updated[index] = {
      ...updated[index],
      status,
      updatedAt: nowIso(),
    };
    await this.save(updated);
  }

  async listByCategory(category: string): Promise<readonly ProjectSeed[]> {
    const normalized = category.trim().toLowerCase();
    const items = await this.load();
    return items.filter((item) => (item.category ?? "").trim().toLowerCase() === normalized);
  }
}
