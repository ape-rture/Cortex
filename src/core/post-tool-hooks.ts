import { promises as fs } from "node:fs";
import path from "node:path";

export type CiStatus = "unknown" | "pending" | "passed" | "failed";
export type ReviewStatus = "none" | "pending" | "changes_requested" | "approved";

export interface SessionMetadata {
  readonly sessionId: string;
  readonly prUrl?: string;
  readonly branch?: string;
  readonly ciStatus: CiStatus;
  readonly reviewStatus: ReviewStatus;
  readonly mergeable: boolean;
  readonly merged: boolean;
  readonly updatedAt: string;
  readonly history: readonly string[];
}

export interface SessionMetadataSnapshot {
  readonly sessions: Record<string, SessionMetadata>;
}

interface SessionMetadataStoreDeps {
  readonly readFileImpl?: (filePath: string, encoding: BufferEncoding) => Promise<string>;
  readonly writeFileImpl?: (filePath: string, content: string, encoding: BufferEncoding) => Promise<void>;
  readonly renameImpl?: (oldPath: string, newPath: string) => Promise<void>;
  readonly mkdirImpl?: (dirPath: string, options?: { recursive?: boolean }) => Promise<unknown>;
}

interface MetadataPatch {
  readonly prUrl?: string;
  readonly branch?: string;
  readonly ciStatus?: CiStatus;
  readonly reviewStatus?: ReviewStatus;
  readonly mergeable?: boolean;
  readonly merged?: boolean;
  readonly history: readonly string[];
}

const PR_URL_PATTERN = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/ig;

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeCiStatus(value: string): CiStatus {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("fail")) return "failed";
  if (normalized.includes("pass") || normalized.includes("success")) return "passed";
  if (normalized.includes("pending") || normalized.includes("run")) return "pending";
  return "unknown";
}

function extractTextFragments(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractTextFragments(item));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.entries(record).flatMap(([key, item]) => [key, ...extractTextFragments(item)]);
  }

  return [];
}

function extractBranch(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const branch = record.branch;
  if (typeof branch === "string" && branch.trim().length > 0) {
    return branch.trim();
  }
  return undefined;
}

function extractCiStatus(value: unknown): CiStatus | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const ci = record.ci_status;
  if (typeof ci === "string" && ci.trim().length > 0) {
    return normalizeCiStatus(ci);
  }
  return undefined;
}

function parsePatch(source: "claude_sdk" | "codex_cli", event: unknown): MetadataPatch | null {
  const fragments = extractTextFragments(event);
  const text = fragments.join("\n");
  const history: string[] = [];

  const prMatches = [...text.matchAll(PR_URL_PATTERN)].map((match) => match[0]);
  const prUrl = prMatches.at(-1);
  if (prUrl) {
    history.push(`${source}:pr:${prUrl}`);
  }

  const explicitBranch = extractBranch(event);
  let branch = explicitBranch;

  if (!branch) {
    const switched = text.match(/Switched to branch ['\"]?([^'\"\n]+)['\"]?/i)?.[1];
    const onBranch = text.match(/On branch\s+([\w./-]+)/i)?.[1];
    branch = switched?.trim() || onBranch?.trim();
  }

  if (branch) {
    history.push(`${source}:branch:${branch}`);
  }

  let ciStatus = extractCiStatus(event);
  if (!ciStatus) {
    const normalized = text.toLowerCase();
    if (normalized.includes("ci failed") || normalized.includes("checks failed") || normalized.includes("status: failure")) {
      ciStatus = "failed";
    } else if (normalized.includes("ci passed") || normalized.includes("all checks passed") || normalized.includes("status: success")) {
      ciStatus = "passed";
    } else if (normalized.includes("ci pending") || normalized.includes("checks running")) {
      ciStatus = "pending";
    }
  }

  if (ciStatus) {
    history.push(`${source}:ci:${ciStatus}`);
  }

  let reviewStatus: ReviewStatus | undefined;
  if (event && typeof event === "object") {
    const explicit = (event as Record<string, unknown>).review_status;
    if (typeof explicit === "string" && explicit.trim()) {
      const normalized = explicit.trim().toLowerCase();
      if (normalized.includes("change")) reviewStatus = "changes_requested";
      else if (normalized.includes("approve")) reviewStatus = "approved";
      else if (normalized.includes("pending")) reviewStatus = "pending";
      else reviewStatus = "none";
    }
  }

  const normalizedText = text.toLowerCase();
  if (!reviewStatus) {
    if (normalizedText.includes("changes requested")) reviewStatus = "changes_requested";
    else if (normalizedText.includes("review pending") || normalizedText.includes("awaiting review")) reviewStatus = "pending";
    else if (normalizedText.includes("approved this pull request") || normalizedText.includes("review approved")) reviewStatus = "approved";
  }
  if (reviewStatus) {
    history.push(`${source}:review:${reviewStatus}`);
  }

  let mergeable: boolean | undefined;
  let merged: boolean | undefined;
  if (event && typeof event === "object") {
    const record = event as Record<string, unknown>;
    if (typeof record.mergeable === "boolean") mergeable = record.mergeable;
    if (typeof record.merged === "boolean") merged = record.merged;
  }
  if (typeof mergeable === "undefined" && normalizedText.includes("mergeable")) {
    mergeable = true;
  }
  if (typeof merged === "undefined" && (normalizedText.includes("merged pull request") || normalizedText.includes("pull request merged"))) {
    merged = true;
  }
  if (typeof mergeable === "boolean") {
    history.push(`${source}:mergeable:${String(mergeable)}`);
  }
  if (typeof merged === "boolean") {
    history.push(`${source}:merged:${String(merged)}`);
  }

  if (!prUrl && !branch && !ciStatus && !reviewStatus && typeof mergeable === "undefined" && typeof merged === "undefined") {
    return null;
  }

  return {
    ...(prUrl ? { prUrl } : {}),
    ...(branch ? { branch } : {}),
    ...(ciStatus ? { ciStatus } : {}),
    ...(reviewStatus ? { reviewStatus } : {}),
    ...(typeof mergeable === "boolean" ? { mergeable } : {}),
    ...(typeof merged === "boolean" ? { merged } : {}),
    history,
  };
}

export class SessionMetadataStore {
  private readonly readFileImpl: (filePath: string, encoding: BufferEncoding) => Promise<string>;
  private readonly writeFileImpl: (filePath: string, content: string, encoding: BufferEncoding) => Promise<void>;
  private readonly renameImpl: (oldPath: string, newPath: string) => Promise<void>;
  private readonly mkdirImpl: (dirPath: string, options?: { recursive?: boolean }) => Promise<unknown>;

  constructor(
    private readonly filePath: string,
    deps: SessionMetadataStoreDeps = {},
  ) {
    this.readFileImpl = deps.readFileImpl ?? fs.readFile;
    this.writeFileImpl = deps.writeFileImpl ?? fs.writeFile;
    this.renameImpl = deps.renameImpl ?? fs.rename;
    this.mkdirImpl = deps.mkdirImpl ?? fs.mkdir;
  }

  async load(): Promise<SessionMetadataSnapshot> {
    const raw = await this.readFileImpl(this.filePath, "utf8").catch(() => "");
    if (!raw.trim()) {
      return { sessions: {} };
    }

    try {
      const parsed = JSON.parse(raw) as SessionMetadataSnapshot;
      if (!parsed || typeof parsed !== "object" || !parsed.sessions || typeof parsed.sessions !== "object") {
        return { sessions: {} };
      }
      return parsed;
    } catch {
      return { sessions: {} };
    }
  }

  async update(sessionId: string, patch: MetadataPatch): Promise<SessionMetadata> {
    const snapshot = await this.load();
    const previous = snapshot.sessions[sessionId];

    const next: SessionMetadata = {
      sessionId,
      ciStatus: patch.ciStatus ?? previous?.ciStatus ?? "unknown",
      reviewStatus: patch.reviewStatus ?? previous?.reviewStatus ?? "none",
      mergeable: patch.mergeable ?? previous?.mergeable ?? false,
      merged: patch.merged ?? previous?.merged ?? false,
      updatedAt: nowIso(),
      history: [
        ...(previous?.history ?? []),
        ...patch.history,
      ],
      ...(previous?.prUrl ? { prUrl: previous.prUrl } : {}),
      ...(previous?.branch ? { branch: previous.branch } : {}),
      ...(patch.prUrl ? { prUrl: patch.prUrl } : {}),
      ...(patch.branch ? { branch: patch.branch } : {}),
    };

    const nextSnapshot: SessionMetadataSnapshot = {
      sessions: {
        ...snapshot.sessions,
        [sessionId]: next,
      },
    };

    await this.writeAtomic(nextSnapshot);
    return next;
  }

  private async writeAtomic(snapshot: SessionMetadataSnapshot): Promise<void> {
    const dirPath = path.dirname(this.filePath);
    await this.mkdirImpl(dirPath, { recursive: true });

    const tempPath = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    const payload = JSON.stringify(snapshot, null, 2);
    await this.writeFileImpl(tempPath, payload, "utf8");
    await this.renameImpl(tempPath, this.filePath);
  }
}

export class PostToolHookProcessor {
  constructor(private readonly store: SessionMetadataStore) {}

  async processClaudeEvent(sessionId: string, event: unknown): Promise<SessionMetadata | null> {
    return this.process("claude_sdk", sessionId, event);
  }

  async processCodexEvent(sessionId: string, event: unknown): Promise<SessionMetadata | null> {
    return this.process("codex_cli", sessionId, event);
  }

  private async process(
    source: "claude_sdk" | "codex_cli",
    sessionId: string,
    event: unknown,
  ): Promise<SessionMetadata | null> {
    const patch = parsePatch(source, event);
    if (!patch) return null;
    return await this.store.update(sessionId, patch);
  }
}

export { parsePatch };
