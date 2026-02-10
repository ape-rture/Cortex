import { promises as fs } from "node:fs";
import path from "node:path";
import type { AgentFunction } from "../core/agent-runner.js";
import { MarkdownEntityStore } from "../core/entity-store.js";
import { ConfigRouter } from "../core/routing.js";
import type { AgentOutput, Finding } from "../core/types/agent-output.js";
import type {
  AtomicFact,
  EntityKind,
  EntityStore,
  EntitySummary,
  FactSupersession,
} from "../core/types/entity.js";
import type { RouteRequest, RouteResponse } from "../core/types/routing.js";

const DEFAULT_PROMPT_PATH = path.resolve("src", "agents", "prompts", "memory-synthesizer.md");
const STALE_SUMMARY_DAYS = 45;
const STALE_STATUS_FACT_DAYS = 60;
const STALE_NO_FACTS_DAYS = 30;
const ENTITY_KINDS: readonly EntityKind[] = ["people", "companies", "projects", "topics"];

type SummaryUpdateRecord = {
  entityKind?: EntityKind;
  entityId?: string;
  newSummary?: string;
  factCount?: number;
  activeFactCount?: number;
  tags?: string[];
};

type SupersessionRecord = {
  entityKind?: EntityKind;
  entityId?: string;
  oldFactId?: string;
  newFactId?: string;
  reasoning?: string;
};

type StaleAlertRecord = {
  entityKind?: EntityKind;
  entityId?: string;
  entityName?: string;
  suggestedAction?: string;
};

type SynthResultPayload = {
  summary_updates?: SummaryUpdateRecord[];
  supersessions?: SupersessionRecord[];
  stale_alerts?: StaleAlertRecord[];
  newSummary?: string;
  tags?: string[];
};

type MemorySynthDeps = {
  router?: Pick<ConfigRouter, "route">;
  entityStore?: EntityStore;
  promptPath?: string;
  now?: () => Date;
};

function nowIso(now: () => Date): string {
  return now().toISOString();
}

function parseJsonPayload(raw: string): SynthResultPayload | undefined {
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
      return JSON.parse(candidate) as SynthResultPayload;
    } catch {
      // continue
    }
  }
  return undefined;
}

function safeDateMs(value: string | undefined): number {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

function hasTemplateSummary(summary: EntitySummary | null): boolean {
  if (!summary) return true;
  const text = summary.summary.toLowerCase();
  return text.includes("no summary yet");
}

function inferNameFromId(id: string): string {
  return id
    .split("-")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function fallbackSummary(activeFacts: readonly AtomicFact[], name: string): string {
  const top = activeFacts.slice(0, 5).map((fact) => `- ${fact.fact}`);
  if (top.length === 0) {
    return `${name} has no active facts yet.`;
  }
  return [`${name} current summary (auto-generated):`, ...top].join("\n");
}

async function readPrompt(promptPath: string): Promise<string> {
  return await fs.readFile(promptPath, "utf8");
}

function createStaleFinding(staleEntities: string[]): Finding | null {
  if (staleEntities.length === 0) return null;
  return {
    type: "suggestion",
    summary: `${staleEntities.length} stale entit${staleEntities.length === 1 ? "y" : "ies"} need review`,
    detail: staleEntities.slice(0, 5).map((item) => `- ${item}`).join("\n"),
    urgency: "low",
    confidence: 0.8,
    suggested_action: "Review stale entities and capture fresh facts from recent interactions",
    context_refs: ["entities/"],
    requires_human: false,
  };
}

function toFactSupersessions(
  payload: SynthResultPayload | undefined,
  kind: EntityKind,
  id: string,
): FactSupersession[] {
  const supersessions = payload?.supersessions ?? [];
  return supersessions
    .filter((entry) => (entry.entityKind ?? kind) === kind && (entry.entityId ?? id) === id)
    .filter((entry) => typeof entry.oldFactId === "string" && typeof entry.newFactId === "string")
    .map((entry) => ({
      factId: entry.oldFactId!,
      supersededBy: entry.newFactId!,
    }));
}

function pickSummaryUpdate(
  payload: SynthResultPayload | undefined,
  kind: EntityKind,
  id: string,
): SummaryUpdateRecord | undefined {
  const updates = payload?.summary_updates ?? [];
  const exact = updates.find((entry) => (entry.entityKind ?? kind) === kind && (entry.entityId ?? id) === id);
  if (exact) return exact;
  if (payload?.newSummary) {
    return { entityKind: kind, entityId: id, newSummary: payload.newSummary, tags: payload.tags };
  }
  return undefined;
}

export function createMemorySynthesizerAgent(deps: MemorySynthDeps = {}): AgentFunction {
  const router = deps.router ?? new ConfigRouter();
  const entityStore = deps.entityStore ?? new MarkdownEntityStore();
  const promptPath = deps.promptPath ?? DEFAULT_PROMPT_PATH;
  const now = deps.now ?? (() => new Date());

  return async (context): Promise<AgentOutput> => {
    const findings: Finding[] = [];
    const errors: string[] = [];
    const staleEntities = new Set<string>();
    let updatedCount = 0;

    try {
      const systemPrompt = await readPrompt(promptPath);
      const nowMs = now().getTime();

      for (const kind of ENTITY_KINDS) {
        const entityIds = await entityStore.listEntities(kind);
        for (const id of entityIds) {
          try {
            const summary = await entityStore.loadSummary(kind, id);
            const allFacts = await entityStore.loadFacts(kind, id);
            const activeFacts = await entityStore.loadActiveFacts(kind, id);
            if (allFacts.length === 0 || activeFacts.length === 0) continue;

            const lastUpdatedMs = safeDateMs(summary?.lastUpdated);
            const newFacts = allFacts.filter((fact) => safeDateMs(fact.timestamp) > lastUpdatedMs);
            const summaryNeedsUpdate = hasTemplateSummary(summary);
            const needsUpdate = summaryNeedsUpdate || newFacts.length > 0;

            const oldestActiveFactMs = activeFacts.reduce((min, fact) => {
              const ms = safeDateMs(fact.timestamp);
              return ms === 0 ? min : Math.min(min, ms);
            }, Number.POSITIVE_INFINITY);

            const daysSinceSummary = lastUpdatedMs > 0
              ? (nowMs - lastUpdatedMs) / (24 * 60 * 60 * 1000)
              : Number.POSITIVE_INFINITY;
            const daysSinceActiveFact = Number.isFinite(oldestActiveFactMs)
              ? (nowMs - oldestActiveFactMs) / (24 * 60 * 60 * 1000)
              : Number.POSITIVE_INFINITY;
            const daysSinceAnyFact = allFacts.length > 0
              ? (nowMs - Math.max(...allFacts.map((fact) => safeDateMs(fact.timestamp)))) / (24 * 60 * 60 * 1000)
              : Number.POSITIVE_INFINITY;

            if (
              !needsUpdate &&
              (daysSinceSummary > STALE_SUMMARY_DAYS ||
                daysSinceActiveFact > STALE_STATUS_FACT_DAYS ||
                daysSinceAnyFact > STALE_NO_FACTS_DAYS)
            ) {
              staleEntities.add(`${kind}/${id}`);
            }

            if (!needsUpdate) continue;

            const request: RouteRequest = {
              task_type: "research_analysis",
              system_prompt: systemPrompt,
              prompt: [
                `entityKind: ${kind}`,
                `entityId: ${id}`,
                `entityName: ${summary?.name ?? inferNameFromId(id)}`,
                "",
                "currentSummary:",
                summary?.summary ?? "(none)",
                "",
                "activeFacts:",
                JSON.stringify(activeFacts, null, 2),
                "",
                "newFactsSinceSummary:",
                JSON.stringify(newFacts, null, 2),
              ].join("\n"),
              max_tokens: 5000,
            };

            const response: RouteResponse = await router.route(request);
            const parsed = parseJsonPayload(response.content);

            const supersessions = toFactSupersessions(parsed, kind, id);
            if (supersessions.length > 0) {
              await entityStore.supersedeFacts(kind, id, supersessions);
            }

            const refreshedFacts = await entityStore.loadFacts(kind, id);
            const refreshedActiveFacts = await entityStore.loadActiveFacts(kind, id);
            const update = pickSummaryUpdate(parsed, kind, id);
            const summaryText = update?.newSummary?.trim()
              ? update.newSummary.trim()
              : fallbackSummary(refreshedActiveFacts, summary?.name ?? inferNameFromId(id));

            const nextSummary: EntitySummary = {
              id,
              kind,
              name: summary?.name ?? inferNameFromId(id),
              summary: summaryText,
              lastUpdated: nowIso(now),
              factCount: update?.factCount ?? refreshedFacts.length,
              activeFactCount: update?.activeFactCount ?? refreshedActiveFacts.length,
              tags: update?.tags ?? summary?.tags ?? [],
            };
            await entityStore.writeSummary(kind, id, nextSummary);
            updatedCount += 1;

            const staleFromPayload = (parsed?.stale_alerts ?? [])
              .filter((alert) => (alert.entityKind ?? kind) === kind && (alert.entityId ?? id) === id);
            for (const alert of staleFromPayload) {
              staleEntities.add(`${kind}/${id}${alert.suggestedAction ? `: ${alert.suggestedAction}` : ""}`);
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            errors.push(`${kind}/${id}: ${message}`);
          }
        }
      }

      findings.push({
        type: "insight",
        summary: `Memory synthesis updated ${updatedCount} entit${updatedCount === 1 ? "y" : "ies"}`,
        urgency: "low",
        confidence: 0.9,
        context_refs: ["entities/"],
        requires_human: false,
      });

      const staleFinding = createStaleFinding(Array.from(staleEntities));
      if (staleFinding) {
        findings.push(staleFinding);
      }
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

export const memorySynthesizerAgent: AgentFunction = createMemorySynthesizerAgent();

export type {
  MemorySynthDeps,
  SynthResultPayload,
  SummaryUpdateRecord,
  SupersessionRecord,
  StaleAlertRecord,
};
