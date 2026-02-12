import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import type { Dirent } from "node:fs";
import path from "node:path";
import type { AgentFunction } from "../core/agent-runner.js";
import { MarkdownEntityStore } from "../core/entity-store.js";
import { ConfigRouter } from "../core/routing.js";
import type { AgentOutput, Finding } from "../core/types/agent-output.js";
import type {
  AtomicFact,
  EntityKind,
  EntityStore,
  FactCategory,
  FactSource,
} from "../core/types/entity.js";
import type { RouteRequest, RouteResponse, TaskType } from "../core/types/routing.js";
import { wrapUntrusted } from "../core/security/untrusted-content.js";

const DEFAULT_PROMPT_PATH = path.resolve("src", "agents", "prompts", "fact-extractor.md");
const DEFAULT_RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_CHARS_PER_FILE = 12_000;

type KindMap = {
  people: "people";
  companies: "companies";
  projects: "projects";
  topics: "topics";
};

type ExtractedFact = {
  fact: string;
  category: FactCategory;
  confidence: number;
  reasoning?: string;
};

type ExtractedEntity = {
  entityKind: EntityKind;
  entityId: string;
  entityName: string;
  facts: ExtractedFact[];
};

type ExtractedPayload = {
  entities?: ExtractedEntity[];
};

type FactExtractorDeps = {
  router?: Pick<ConfigRouter, "route">;
  entityStore?: EntityStore;
  promptPath?: string;
  recentWindowMs?: number;
  maxCharsPerFile?: number;
  now?: () => Date;
};

type RecentFile = {
  absolutePath: string;
  relativePath: string;
  mtimeMs: number;
};

function nowIso(now: () => Date): string {
  return now().toISOString();
}

function parseJsonPayload(raw: string): ExtractedPayload | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const candidates: string[] = [trimmed];
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    candidates.push(fencedMatch[1].trim());
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as ExtractedPayload;
    } catch {
      // try next candidate
    }
  }
  return undefined;
}

function isEntityKind(value: string): value is EntityKind {
  return value === "people" || value === "companies" || value === "projects" || value === "topics";
}

function isFactCategory(value: string): value is FactCategory {
  return value === "relationship" || value === "milestone" || value === "status" || value === "preference";
}

function sourceFromPath(relativePath: string): FactSource {
  const normalized = relativePath.replaceAll("\\", "/");
  if (normalized.startsWith("meetings/")) return "meeting";
  if (normalized.startsWith("daily/")) return "extraction";
  return "manual";
}

function sanitizeExtractedEntity(entity: ExtractedEntity): ExtractedEntity | null {
  if (!isEntityKind(entity.entityKind)) return null;
  const entityId = String(entity.entityId ?? "").trim();
  const entityName = String(entity.entityName ?? entityId).trim();
  if (!entityId || !entityName) return null;

  const facts = (entity.facts ?? [])
    .filter((fact) => typeof fact.fact === "string" && fact.fact.trim().length > 0)
    .filter((fact) => isFactCategory(String(fact.category)))
    .map((fact) => ({
      fact: fact.fact.trim(),
      category: fact.category,
      confidence: Number.isFinite(fact.confidence) ? fact.confidence : 0.5,
      reasoning: typeof fact.reasoning === "string" ? fact.reasoning : undefined,
    }))
    .filter((fact) => fact.confidence >= 0.5);

  return {
    entityKind: entity.entityKind,
    entityId,
    entityName,
    facts,
  };
}

async function readPrompt(promptPath: string): Promise<string> {
  return await fs.readFile(promptPath, "utf8");
}

async function walkFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];
  let entries: Dirent[];
  try {
    entries = await fs.readdir(rootDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  for (const entry of entries) {
    const absolute = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(absolute));
      continue;
    }
    if (entry.isFile()) {
      files.push(absolute);
    }
  }
  return files;
}

async function listRecentFiles(
  basePath: string,
  recentWindowMs: number,
  now: () => Date,
): Promise<RecentFile[]> {
  const cutoff = now().getTime() - recentWindowMs;
  const roots = [path.join(basePath, "meetings"), path.join(basePath, "daily")];
  const files = (await Promise.all(roots.map((root) => walkFiles(root)))).flat();

  const recent: RecentFile[] = [];
  for (const absolutePath of files) {
    const stat = await fs.stat(absolutePath);
    if (stat.mtimeMs < cutoff) continue;
    recent.push({
      absolutePath,
      relativePath: path.relative(basePath, absolutePath).replaceAll("\\", "/"),
      mtimeMs: stat.mtimeMs,
    });
  }

  recent.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return recent;
}

async function routeFactExtraction(
  router: Pick<ConfigRouter, "route">,
  request: Omit<RouteRequest, "task_type">,
): Promise<RouteResponse> {
  try {
    return await router.route({
      ...request,
      task_type: "fact_extraction" as unknown as TaskType,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("No route for task type")) {
      throw err;
    }
    return await router.route({
      ...request,
      task_type: "classification",
    });
  }
}

function makeSummaryFinding(
  filesScanned: number,
  entitiesTouched: number,
  factsExtracted: number,
  contextRefs: readonly string[],
): Finding {
  return {
    type: factsExtracted > 0 ? "insight" : "suggestion",
    summary: factsExtracted > 0
      ? `Extracted ${factsExtracted} fact${factsExtracted === 1 ? "" : "s"} from ${filesScanned} recent file${filesScanned === 1 ? "" : "s"}`
      : `Scanned ${filesScanned} recent file${filesScanned === 1 ? "" : "s"}; no durable facts extracted`,
    detail: `Entities touched: ${entitiesTouched}`,
    urgency: "low",
    confidence: 0.9,
    context_refs: [...contextRefs].slice(0, 10),
    requires_human: false,
  };
}

export function createFactExtractorAgent(deps: FactExtractorDeps = {}): AgentFunction {
  const router = deps.router ?? new ConfigRouter();
  const entityStore = deps.entityStore ?? new MarkdownEntityStore();
  const promptPath = deps.promptPath ?? DEFAULT_PROMPT_PATH;
  const recentWindowMs = deps.recentWindowMs ?? DEFAULT_RECENT_WINDOW_MS;
  const maxCharsPerFile = deps.maxCharsPerFile ?? DEFAULT_MAX_CHARS_PER_FILE;
  const now = deps.now ?? (() => new Date());

  return async (context): Promise<AgentOutput> => {
    const findings: Finding[] = [];
    const errors: string[] = [];
    const entitiesTouched = new Set<string>();
    let factsExtracted = 0;
    let filesScanned = 0;

    try {
      const [systemPrompt, recentFiles] = await Promise.all([
        readPrompt(promptPath),
        listRecentFiles(context.basePath, recentWindowMs, now),
      ]);

      if (recentFiles.length === 0) {
        findings.push({
          type: "insight",
          summary: "No recent daily or meeting files found in the last 24 hours",
          urgency: "low",
          confidence: 1,
          context_refs: [],
          requires_human: false,
        });
        return {
          agent: context.agent,
          timestamp: nowIso(now),
          findings,
          memory_updates: [],
          errors,
        };
      }

      for (const file of recentFiles) {
        filesScanned += 1;
        try {
          const raw = await fs.readFile(file.absolutePath, "utf8");
          const content = raw.slice(0, maxCharsPerFile);
          const source = sourceFromPath(file.relativePath);
          const request: Omit<RouteRequest, "task_type"> = {
            prompt: [
              `source: ${source}`,
              `sourceRef: ${file.relativePath}`,
              "",
              wrapUntrusted(content, source),
            ].join("\n"),
            system_prompt: systemPrompt,
            max_tokens: 4000,
          };
          const response = await routeFactExtraction(router, request);
          const parsed = parseJsonPayload(response.content);
          const entities = (parsed?.entities ?? [])
            .map((entity) => sanitizeExtractedEntity(entity))
            .filter((entity): entity is ExtractedEntity => entity !== null)
            .filter((entity) => entity.facts.length > 0);

          for (const entity of entities) {
            await entityStore.createEntity(entity.entityKind, entity.entityId, entity.entityName);
            // Facts extracted from external content are marked untrusted and
            // capped at 0.7 confidence to prevent prompt-injected "facts" from
            // appearing authoritative in the knowledge graph.
            const MAX_UNTRUSTED_CONFIDENCE = 0.7;
            const mappedFacts: AtomicFact[] = entity.facts.map((fact) => ({
              id: randomUUID(),
              fact: fact.fact,
              category: fact.category,
              timestamp: nowIso(now),
              source: sourceFromPath(file.relativePath),
              sourceRef: file.relativePath,
              confidence: Math.max(0, Math.min(MAX_UNTRUSTED_CONFIDENCE, fact.confidence)),
              sourceTrust: "untrusted" as const,
              status: "active",
            }));
            await entityStore.appendFacts(entity.entityKind, entity.entityId, mappedFacts);
            entitiesTouched.add(`${entity.entityKind}:${entity.entityId}`);
            factsExtracted += mappedFacts.length;
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push(`${file.relativePath}: ${message}`);
        }
      }

      findings.push(
        makeSummaryFinding(
          filesScanned,
          entitiesTouched.size,
          factsExtracted,
          recentFiles.map((file) => file.relativePath),
        ),
      );
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }

    return {
      agent: context.agent,
      timestamp: nowIso(now),
      findings,
      memory_updates: [],
      errors,
    };
  };
}

export const factExtractorAgent: AgentFunction = createFactExtractorAgent();

export type { FactExtractorDeps, ExtractedPayload, ExtractedEntity, ExtractedFact, KindMap };
