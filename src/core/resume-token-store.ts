import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ResumeToken, ResumeTokenStore } from "./types/session.js";

const DEFAULT_TOKENS_PATH = path.resolve("context", "resume-tokens.json");
const DEFAULT_RETENTION_DAYS = 7;

function nowIso(): string {
  return new Date().toISOString();
}

function byNewestCreatedAt(a: ResumeToken, b: ResumeToken): number {
  return b.created_at.localeCompare(a.created_at);
}

function defaultPruneBefore(retentionDays: number): string {
  return new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
}

function normalizeToken(input: ResumeToken): ResumeToken {
  const tokenId = input.token.trim().length > 0
    ? input.token
    : randomUUID().replace(/-/g, "").slice(0, 16);

  return {
    ...input,
    token: tokenId,
    created_at: input.created_at || nowIso(),
  };
}

export class FileResumeTokenStore implements ResumeTokenStore {
  private readonly tokensPath: string;
  private readonly retentionDays: number;

  constructor(tokensPath: string = DEFAULT_TOKENS_PATH, retentionDays: number = DEFAULT_RETENTION_DAYS) {
    this.tokensPath = tokensPath;
    this.retentionDays = retentionDays;
  }

  async save(token: ResumeToken): Promise<void> {
    let tokens = await this.readAll();
    tokens = this.pruneArray(tokens, defaultPruneBefore(this.retentionDays)).remaining;

    const normalized = normalizeToken(token);
    const existingIndex = tokens.findIndex((item) => item.token === normalized.token);
    if (existingIndex >= 0) {
      tokens[existingIndex] = normalized;
    } else {
      tokens.push(normalized);
    }

    await this.writeAll(tokens);
  }

  async load(token: string): Promise<ResumeToken | undefined> {
    const tokens = await this.readAndAutoPrune();
    return tokens.find((item) => item.token === token);
  }

  async listRecent(n: number): Promise<readonly ResumeToken[]> {
    const tokens = await this.readAndAutoPrune();
    return tokens
      .slice()
      .sort(byNewestCreatedAt)
      .slice(0, Math.max(0, n));
  }

  async prune(before: string): Promise<number> {
    const tokens = await this.readAll();
    const result = this.pruneArray(tokens, before);
    await this.writeAll(result.remaining);
    return result.removed;
  }

  private async readAndAutoPrune(): Promise<ResumeToken[]> {
    const tokens = await this.readAll();
    const pruneBefore = defaultPruneBefore(this.retentionDays);
    const result = this.pruneArray(tokens, pruneBefore);
    if (result.removed > 0) {
      await this.writeAll(result.remaining);
    }
    return result.remaining;
  }

  private async readAll(): Promise<ResumeToken[]> {
    try {
      const raw = await fs.readFile(this.tokensPath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed as ResumeToken[];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw err;
    }
  }

  private async writeAll(tokens: readonly ResumeToken[]): Promise<void> {
    await fs.mkdir(path.dirname(this.tokensPath), { recursive: true });
    const normalized = tokens
      .map((token) => normalizeToken(token))
      .sort(byNewestCreatedAt);
    await fs.writeFile(this.tokensPath, JSON.stringify(normalized, null, 2), "utf8");
  }

  private pruneArray(tokens: readonly ResumeToken[], before: string): {
    remaining: ResumeToken[];
    removed: number;
  } {
    const remaining = tokens.filter((token) => token.created_at >= before);
    return {
      remaining,
      removed: tokens.length - remaining.length,
    };
  }
}
