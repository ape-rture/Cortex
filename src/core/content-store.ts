import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  ContentChain,
  ContentDraft,
  ContentSeed,
  ContentStore,
} from "./types/content.js";
import {
  parseContentChains,
  parseContentDraft,
  parseContentSeeds,
  serializeContentChains,
  serializeContentDraft,
  serializeContentSeeds,
} from "../utils/markdown.js";

const DEFAULT_SEEDS_PATH = path.resolve("projects", "content-seeds.md");
const DEFAULT_DRAFTS_DIR = path.resolve("projects", "content-drafts");
const DEFAULT_CHAINS_PATH = path.resolve("projects", "content-chains.md");

type ContentStorePaths = {
  seedsPath: string;
  draftsDir: string;
  chainsPath: string;
};

export class MarkdownContentStore implements ContentStore {
  private readonly paths: ContentStorePaths;

  constructor(paths?: Partial<ContentStorePaths>) {
    this.paths = {
      seedsPath: paths?.seedsPath ?? DEFAULT_SEEDS_PATH,
      draftsDir: paths?.draftsDir ?? DEFAULT_DRAFTS_DIR,
      chainsPath: paths?.chainsPath ?? DEFAULT_CHAINS_PATH,
    };
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
