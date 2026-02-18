import { promises as fs } from "node:fs";
import path from "node:path";
import type { FeatureProposal, FeatureStatus, FeatureStore } from "./types/capture.js";
import { parseFeatureProposals, serializeFeatureProposals } from "../utils/markdown.js";

const DEFAULT_FEATURE_PATH = path.resolve("projects", "feature-proposals.md");

type FeatureStorePaths = {
  featurePath: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function toFeatureId(index: number): string {
  return `feature-${String(index).padStart(3, "0")}`;
}

function nextFeatureId(items: readonly FeatureProposal[]): string {
  const max = items.reduce((current, item) => {
    const match = item.id.match(/^feature-(\d+)$/);
    if (!match) return current;
    const value = Number.parseInt(match[1], 10);
    return Number.isFinite(value) ? Math.max(current, value) : current;
  }, 0);
  return toFeatureId(max + 1);
}

export class MarkdownFeatureStore implements FeatureStore {
  private readonly paths: FeatureStorePaths;

  constructor(paths?: Partial<FeatureStorePaths>) {
    this.paths = {
      featurePath: paths?.featurePath ?? DEFAULT_FEATURE_PATH,
    };
  }

  async load(): Promise<readonly FeatureProposal[]> {
    try {
      const raw = await fs.readFile(this.paths.featurePath, "utf8");
      return parseFeatureProposals(raw);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }

  async save(items: readonly FeatureProposal[]): Promise<void> {
    await fs.mkdir(path.dirname(this.paths.featurePath), { recursive: true });
    await fs.writeFile(this.paths.featurePath, serializeFeatureProposals(items), "utf8");
  }

  async add(item: Omit<FeatureProposal, "id" | "capturedAt" | "updatedAt">): Promise<string> {
    const items = await this.load();
    const timestamp = nowIso();
    const next: FeatureProposal = {
      ...item,
      id: nextFeatureId(items),
      capturedAt: timestamp,
      updatedAt: timestamp,
    };
    await this.save([...items, next]);
    return next.id;
  }

  async updateStatus(id: string, status: FeatureStatus): Promise<void> {
    const items = await this.load();
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new Error(`Feature proposal not found: ${id}`);
    }

    const updated = [...items];
    updated[index] = {
      ...updated[index],
      status,
      updatedAt: nowIso(),
    };
    await this.save(updated);
  }
}
