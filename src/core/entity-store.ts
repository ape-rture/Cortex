import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  AtomicFact,
  EntityKind,
  EntityStore,
  EntitySummary,
  FactSupersession,
} from "./types/entity.js";

const DEFAULT_ENTITIES_ROOT = path.resolve("entities");

type EntityStorePaths = {
  entitiesRoot: string;
  templateSummaryPath: string;
  templateFactsPath: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function isEntityKind(value: string): value is EntityKind {
  return value === "people" || value === "companies" || value === "projects" || value === "topics";
}

function parseListLike(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed === "[]") return [];

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean);
      }
    } catch {
      // fallback below
    }
    const inner = trimmed.slice(1, -1);
    return inner
      .split(",")
      .map((item) => item.replace(/^["']|["']$/g, "").trim())
      .filter(Boolean);
  }

  return trimmed
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseFrontMatter(content: string): {
  metadata: Record<string, string>;
  body: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { metadata: {}, body: content };
  }

  const metadata: Record<string, string> = {};
  const lines = match[1].split(/\r?\n/);
  for (const line of lines) {
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    metadata[kv[1]] = kv[2].trim();
  }
  return {
    metadata,
    body: match[2] ?? "",
  };
}

function formatSummary(summary: EntitySummary): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`id: ${summary.id}`);
  lines.push(`kind: ${summary.kind}`);
  lines.push(`name: ${summary.name}`);
  lines.push(`lastUpdated: ${summary.lastUpdated}`);
  lines.push(`factCount: ${summary.factCount}`);
  lines.push(`activeFactCount: ${summary.activeFactCount}`);
  lines.push(`tags: ${JSON.stringify(summary.tags ?? [])}`);
  lines.push("---");
  lines.push("");
  lines.push(summary.summary.trim());
  return lines.join("\n").trimEnd() + "\n";
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export class MarkdownEntityStore implements EntityStore {
  private readonly paths: EntityStorePaths;

  constructor(paths?: Partial<EntityStorePaths>) {
    const entitiesRoot = paths?.entitiesRoot ?? DEFAULT_ENTITIES_ROOT;
    this.paths = {
      entitiesRoot,
      templateSummaryPath: paths?.templateSummaryPath ?? path.join(entitiesRoot, "_template-summary.md"),
      templateFactsPath: paths?.templateFactsPath ?? path.join(entitiesRoot, "_template-facts.json"),
    };
  }

  async listEntities(kind: EntityKind): Promise<readonly string[]> {
    const dir = this.kindDir(kind);
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }

  async loadSummary(kind: EntityKind, id: string): Promise<EntitySummary | null> {
    const summaryPath = this.summaryPath(kind, id);
    let raw: string;
    try {
      raw = await fs.readFile(summaryPath, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }

    const { metadata, body } = parseFrontMatter(raw);
    const parsedKind = metadata.kind;
    const factCount = Number.parseInt(metadata.factCount ?? "0", 10);
    const activeFactCount = Number.parseInt(metadata.activeFactCount ?? "0", 10);

    return {
      id: metadata.id || id,
      kind: parsedKind && isEntityKind(parsedKind) ? parsedKind : kind,
      name: metadata.name || id,
      summary: body.trim(),
      lastUpdated: metadata.lastUpdated || nowIso(),
      factCount: Number.isFinite(factCount) ? factCount : 0,
      activeFactCount: Number.isFinite(activeFactCount) ? activeFactCount : 0,
      tags: parseListLike(metadata.tags ?? ""),
    };
  }

  async loadFacts(kind: EntityKind, id: string): Promise<readonly AtomicFact[]> {
    const factsPath = this.factsPath(kind, id);
    try {
      const raw = await fs.readFile(factsPath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed as AtomicFact[];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }

  async loadActiveFacts(kind: EntityKind, id: string): Promise<readonly AtomicFact[]> {
    const facts = await this.loadFacts(kind, id);
    return facts.filter((fact) => fact.status === "active");
  }

  async appendFacts(kind: EntityKind, id: string, facts: readonly AtomicFact[]): Promise<void> {
    const dir = this.entityDir(kind, id);
    await fs.mkdir(dir, { recursive: true });

    const existing = await this.loadFacts(kind, id);
    const next = [...existing, ...facts];
    await fs.writeFile(this.factsPath(kind, id), JSON.stringify(next, null, 2), "utf8");
  }

  async supersedeFacts(kind: EntityKind, id: string, supersessions: readonly FactSupersession[]): Promise<void> {
    if (supersessions.length === 0) return;
    const byId = new Map(supersessions.map((entry) => [entry.factId, entry.supersededBy]));
    const facts = await this.loadFacts(kind, id);
    if (facts.length === 0) return;

    const next = facts.map((fact) => {
      const supersededBy = byId.get(fact.id);
      if (!supersededBy) return fact;
      return {
        ...fact,
        status: "superseded" as const,
        supersededBy,
      };
    });

    await fs.mkdir(this.entityDir(kind, id), { recursive: true });
    await fs.writeFile(this.factsPath(kind, id), JSON.stringify(next, null, 2), "utf8");
  }

  async writeSummary(kind: EntityKind, id: string, summary: EntitySummary): Promise<void> {
    await fs.mkdir(this.entityDir(kind, id), { recursive: true });
    const normalized: EntitySummary = {
      ...summary,
      id,
      kind,
      tags: summary.tags ?? [],
    };
    await fs.writeFile(this.summaryPath(kind, id), formatSummary(normalized), "utf8");
  }

  async createEntity(kind: EntityKind, id: string, name: string): Promise<void> {
    const dir = this.entityDir(kind, id);
    await fs.mkdir(dir, { recursive: true });

    const timestamp = nowIso();
    const summaryPath = this.summaryPath(kind, id);
    const factsPath = this.factsPath(kind, id);

    if (!(await exists(summaryPath))) {
      const templateSummary = await this.readTemplateSummary();
      const summaryContent = templateSummary
        .replaceAll("{id}", id)
        .replaceAll("{kind}", kind)
        .replaceAll("{name}", name)
        .replaceAll("{timestamp}", timestamp);
      await fs.writeFile(summaryPath, summaryContent.trimEnd() + "\n", "utf8");
    }

    if (!(await exists(factsPath))) {
      const templateFacts = await this.readTemplateFacts();
      await fs.writeFile(factsPath, templateFacts.trimEnd() + "\n", "utf8");
    }
  }

  private kindDir(kind: EntityKind): string {
    return path.join(this.paths.entitiesRoot, kind);
  }

  private entityDir(kind: EntityKind, id: string): string {
    return path.join(this.kindDir(kind), id);
  }

  private summaryPath(kind: EntityKind, id: string): string {
    return path.join(this.entityDir(kind, id), "summary.md");
  }

  private factsPath(kind: EntityKind, id: string): string {
    return path.join(this.entityDir(kind, id), "facts.json");
  }

  private async readTemplateSummary(): Promise<string> {
    try {
      return await fs.readFile(this.paths.templateSummaryPath, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      return [
        "---",
        "id: {id}",
        "kind: {kind}",
        "name: {name}",
        "lastUpdated: {timestamp}",
        "factCount: 0",
        "activeFactCount: 0",
        "tags: []",
        "---",
        "",
        "# {name}",
        "",
        "*No summary yet.*",
        "",
      ].join("\n");
    }
  }

  private async readTemplateFacts(): Promise<string> {
    try {
      return await fs.readFile(this.paths.templateFactsPath, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      return "[]";
    }
  }
}
