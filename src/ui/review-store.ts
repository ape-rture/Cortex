import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

export type ReviewStatus = "pending" | "approved" | "dismissed" | "snoozed";

export interface ReviewItem {
  readonly id: string;
  readonly summary: string;
  readonly detail?: string;
  readonly urgency: string;
  readonly agent: string;
  readonly salience: number;
  readonly status: ReviewStatus;
  readonly created_at: string;
}

interface ReviewStateRecord {
  status: ReviewStatus;
  updated_at: string;
  snoozed_until?: string;
}

type ReviewStateMap = Record<string, ReviewStateRecord>;

export interface ReviewStore {
  list(): Promise<readonly ReviewItem[]>;
  pendingCount(): Promise<number>;
  approve(id: string): Promise<ReviewItem | null>;
  dismiss(id: string): Promise<ReviewItem | null>;
  snooze(id: string, duration: string): Promise<ReviewItem | null>;
}

const DEFAULT_REVIEW_QUEUE_PATH = path.resolve("actions", "review-queue.md");
const DEFAULT_REVIEW_STATE_PATH = path.resolve("actions", "review-state.json");
const FLAG_LINE_REGEX = /^-\s+\[[ xX]\]\s+\*\*Flagged\*\*:\s*(.+)$/;
const FILE_HINT_REGEX = /\(file:\s*([^)]+)\)\s*$/i;

function nowIso(): string {
  return new Date().toISOString();
}

function createId(source: string): string {
  return createHash("sha256").update(source).digest("hex").slice(0, 12);
}

function parseDuration(duration: string): number {
  const match = duration.trim().match(/^(\d+)\s*([smhd])$/i);
  if (!match) {
    throw new Error(`Invalid duration "${duration}". Use formats like 30m, 2h, 1d.`);
  }
  const amount = Number.parseInt(match[1] ?? "0", 10);
  const unit = (match[2] ?? "m").toLowerCase();
  const multiplier =
    unit === "s" ? 1_000 :
    unit === "m" ? 60_000 :
    unit === "h" ? 3_600_000 :
    86_400_000;
  return amount * multiplier;
}

function parseFlagLine(line: string, createdAt: string): ReviewItem | null {
  const match = line.match(FLAG_LINE_REGEX);
  if (!match?.[1]) return null;

  const raw = match[1].trim();
  const fileHint = raw.match(FILE_HINT_REGEX)?.[1]?.trim();
  const summary = raw.replace(FILE_HINT_REGEX, "").trim();

  return {
    id: createId(line),
    summary: summary.slice(0, 280),
    detail: fileHint ? `Source: ${fileHint}` : undefined,
    urgency: "medium",
    agent: "orchestrator",
    salience: 0.5,
    status: "pending",
    created_at: createdAt,
  };
}

function applyState(item: ReviewItem, state: ReviewStateRecord | undefined): ReviewItem {
  if (!state) return item;

  if (state.status === "snoozed" && state.snoozed_until) {
    const until = Date.parse(state.snoozed_until);
    if (Number.isFinite(until) && until <= Date.now()) {
      return {
        ...item,
        status: "pending",
      };
    }
  }

  return {
    ...item,
    status: state.status,
  };
}

async function ensureDirectory(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export class MarkdownReviewStore implements ReviewStore {
  private readonly queuePath: string;
  private readonly statePath: string;

  constructor(
    queuePath: string = DEFAULT_REVIEW_QUEUE_PATH,
    statePath: string = DEFAULT_REVIEW_STATE_PATH,
  ) {
    this.queuePath = queuePath;
    this.statePath = statePath;
  }

  async list(): Promise<readonly ReviewItem[]> {
    const baseItems = await this.loadQueueItems();
    const state = await this.loadState();

    return baseItems
      .map((item) => applyState(item, state[item.id]))
      .filter((item) => item.status === "pending" || item.status === "snoozed");
  }

  async pendingCount(): Promise<number> {
    const items = await this.list();
    return items.filter((item) => item.status === "pending").length;
  }

  async approve(id: string): Promise<ReviewItem | null> {
    return this.updateStatus(id, { status: "approved", updated_at: nowIso() });
  }

  async dismiss(id: string): Promise<ReviewItem | null> {
    return this.updateStatus(id, { status: "dismissed", updated_at: nowIso() });
  }

  async snooze(id: string, duration: string): Promise<ReviewItem | null> {
    const ms = parseDuration(duration);
    const until = new Date(Date.now() + ms).toISOString();
    return this.updateStatus(id, {
      status: "snoozed",
      updated_at: nowIso(),
      snoozed_until: until,
    });
  }

  private async updateStatus(id: string, next: ReviewStateRecord): Promise<ReviewItem | null> {
    const items = await this.loadQueueItems();
    const existing = items.find((item) => item.id === id);
    if (!existing) return null;

    const state = await this.loadState();
    state[id] = next;
    await this.saveState(state);
    return applyState(existing, next);
  }

  private async loadQueueItems(): Promise<ReviewItem[]> {
    let raw = "";
    try {
      raw = await fs.readFile(this.queuePath, "utf8");
    } catch {
      return [];
    }

    let createdAt = nowIso();
    try {
      const stat = await fs.stat(this.queuePath);
      createdAt = stat.mtime.toISOString();
    } catch {
      // Use now fallback.
    }

    const lines = raw.split(/\r?\n/);
    return lines
      .map((line) => parseFlagLine(line, createdAt))
      .filter((item): item is ReviewItem => item !== null);
  }

  private async loadState(): Promise<ReviewStateMap> {
    try {
      const raw = await fs.readFile(this.statePath, "utf8");
      const data = JSON.parse(raw) as ReviewStateMap;
      return typeof data === "object" && data !== null ? data : {};
    } catch {
      return {};
    }
  }

  private async saveState(state: ReviewStateMap): Promise<void> {
    await ensureDirectory(this.statePath);
    await fs.writeFile(this.statePath, JSON.stringify(state, null, 2), "utf8");
  }
}
