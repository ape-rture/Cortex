import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  ContentChain,
  ContentDraft,
  ContentIdea,
  ContentPlatform,
  ContentSeed,
  ContentStatus,
  ContentStore,
} from "./types/content.js";
import {
  parseContentChains,
  parseContentDraft,
  parseContentIdeas,
  parseContentSeeds,
  serializeContentChains,
  serializeContentDraft,
  serializeContentIdeas,
  serializeContentSeeds,
} from "../utils/markdown.js";

const DEFAULT_IDEAS_PATH = path.resolve("projects", "content-ideas.md");
const DEFAULT_SEEDS_PATH = path.resolve("projects", "content-seeds.md");
const DEFAULT_DRAFTS_DIR = path.resolve("projects", "content-drafts");
const DEFAULT_CHAINS_PATH = path.resolve("projects", "content-chains.md");

type ContentStorePaths = {
  ideasPath: string;
  seedsPath: string;
  draftsDir: string;
  chainsPath: string;
};

function toIdeaId(index: number): string {
  return `content-${String(index).padStart(3, "0")}`;
}

function nextIdeaId(ideas: readonly ContentIdea[]): string {
  const max = ideas.reduce((current, idea) => {
    const match = idea.id.match(/^content-(\d+)$/);
    if (!match) return current;
    const value = Number.parseInt(match[1], 10);
    return Number.isFinite(value) ? Math.max(current, value) : current;
  }, 0);
  return toIdeaId(max + 1);
}

export class MarkdownContentStore implements ContentStore {
  private readonly paths: ContentStorePaths;

  constructor(paths?: Partial<ContentStorePaths>) {
    this.paths = {
      ideasPath: paths?.ideasPath ?? DEFAULT_IDEAS_PATH,
      seedsPath: paths?.seedsPath ?? DEFAULT_SEEDS_PATH,
      draftsDir: paths?.draftsDir ?? DEFAULT_DRAFTS_DIR,
      chainsPath: paths?.chainsPath ?? DEFAULT_CHAINS_PATH,
    };
  }

  async loadIdeas(): Promise<readonly ContentIdea[]> {
    try {
      const raw = await fs.readFile(this.paths.ideasPath, "utf8");
      return parseContentIdeas(raw);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }

  async saveIdeas(ideas: readonly ContentIdea[]): Promise<void> {
    await fs.writeFile(this.paths.ideasPath, serializeContentIdeas(ideas), "utf8");
  }

  async addIdea(idea: Omit<ContentIdea, "id">): Promise<string> {
    const ideas = await this.loadIdeas();
    const id = nextIdeaId(ideas);
    const next: ContentIdea = { ...idea, id };
    await this.saveIdeas([...ideas, next]);
    return id;
  }

  async updateIdeaStatus(id: string, status: ContentStatus): Promise<void> {
    const ideas = await this.loadIdeas();
    const index = ideas.findIndex((idea) => idea.id === id);
    if (index === -1) throw new Error(`Content idea not found: ${id}`);
    const updated = [...ideas];
    updated[index] = { ...updated[index], status };
    await this.saveIdeas(updated);
  }

  async searchIdeas(query: string): Promise<readonly ContentIdea[]> {
    const normalized = query.toLowerCase();
    const ideas = await this.loadIdeas();
    return ideas.filter((idea) => idea.topic.toLowerCase().includes(normalized));
  }

  async filterByStatus(status: ContentStatus): Promise<readonly ContentIdea[]> {
    const ideas = await this.loadIdeas();
    return ideas.filter((idea) => idea.status === status);
  }

  async filterByPlatform(platform: ContentPlatform): Promise<readonly ContentIdea[]> {
    const ideas = await this.loadIdeas();
    return ideas.filter((idea) => idea.platform === platform);
  }

  async loadDraft(ideaId: string): Promise<ContentDraft | undefined> {
    const filePath = path.join(this.paths.draftsDir, `${ideaId}.md`);
    try {
      const raw = await fs.readFile(filePath, "utf8");
      return parseContentDraft(raw);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw err;
    }
  }

  async saveDraft(draft: ContentDraft): Promise<void> {
    await fs.mkdir(this.paths.draftsDir, { recursive: true });
    const filePath = path.join(this.paths.draftsDir, `${draft.ideaId}.md`);
    await fs.writeFile(filePath, serializeContentDraft(draft), "utf8");
  }

  async loadSeeds(): Promise<readonly ContentSeed[]> {
    try {
      const raw = await fs.readFile(this.paths.seedsPath, "utf8");
      return parseContentSeeds(raw);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }

  async saveSeeds(seeds: readonly ContentSeed[]): Promise<void> {
    await fs.writeFile(this.paths.seedsPath, serializeContentSeeds(seeds), "utf8");
  }

  async loadChains(): Promise<readonly ContentChain[]> {
    try {
      const raw = await fs.readFile(this.paths.chainsPath, "utf8");
      return parseContentChains(raw);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }

  async saveChain(chain: ContentChain): Promise<void> {
    const chains = await this.loadChains();
    const index = chains.findIndex((item) => item.chainId === chain.chainId);
    const next = [...chains];
    if (index === -1) {
      next.push(chain);
    } else {
      next[index] = chain;
    }
    await fs.writeFile(this.paths.chainsPath, serializeContentChains(next), "utf8");
  }
}
