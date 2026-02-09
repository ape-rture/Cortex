/**
 * Salience Scorer
 *
 * Scores findings using a weighted average of urgency, relevance,
 * novelty, and actionability. Implements the "fame threshold" from
 * Dennett's architecture — only high-salience findings surface.
 *
 * Design source: decisions/2026-02-02-dennett-architecture.md
 */

import { createHash } from "node:crypto";
import type {
  Finding,
  SalienceWeights,
  ScoredFinding,
  Urgency,
} from "./types/agent-output.js";

// ---------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------

export interface FindingWithAgent {
  readonly finding: Finding;
  readonly agent: string;
}

export interface SalienceScorer {
  score(
    findings: readonly FindingWithAgent[],
    weights?: Partial<SalienceWeights>,
  ): ScoredFinding[];
  reset(): void;
}

// ---------------------------------------------------------------------
// Urgency → numeric mapping
// ---------------------------------------------------------------------

const URGENCY_MAP: Record<Urgency, number> = {
  critical: 1.0,
  high: 0.75,
  medium: 0.5,
  low: 0.25,
};

// ---------------------------------------------------------------------
// Default weights (must sum to ~1.0 for interpretable scores)
// ---------------------------------------------------------------------

const DEFAULT_WEIGHTS: SalienceWeights = {
  urgency: 0.35,
  relevance: 0.25,
  novelty: 0.2,
  actionability: 0.2,
};

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function findingHash(agent: string, summary: string): string {
  return createHash("sha256").update(`${agent}:${summary}`).digest("hex").slice(0, 16);
}

function computeRelevance(finding: Finding): number {
  if (finding.type === "action_item") return 0.9;
  const refs = finding.context_refs ?? [];
  const touchesSensitive = refs.some(
    (r) => r.startsWith("contacts/") || r.startsWith("actions/"),
  );
  return touchesSensitive ? 0.9 : 0.7;
}

function computeActionability(finding: Finding): number {
  return finding.suggested_action ? 0.8 : 0.5;
}

// ---------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------

export class RuleBasedSalienceScorer implements SalienceScorer {
  private readonly defaultWeights: SalienceWeights;
  private readonly seen = new Map<string, number>();

  constructor(defaultWeights?: Partial<SalienceWeights>) {
    this.defaultWeights = { ...DEFAULT_WEIGHTS, ...defaultWeights };
  }

  score(
    findings: readonly FindingWithAgent[],
    weights?: Partial<SalienceWeights>,
  ): ScoredFinding[] {
    const w: SalienceWeights = { ...this.defaultWeights, ...weights };
    const totalWeight = w.urgency + w.relevance + w.novelty + w.actionability;

    return findings
      .map(({ finding, agent }) => {
        const urgency = URGENCY_MAP[finding.urgency] ?? 0.5;
        const relevance = computeRelevance(finding);
        const actionability = computeActionability(finding);

        // Novelty: first=1.0, second=0.5, third+=0.2
        const hash = findingHash(agent, finding.summary);
        const count = (this.seen.get(hash) ?? 0) + 1;
        this.seen.set(hash, count);
        const novelty = count === 1 ? 1.0 : count === 2 ? 0.5 : 0.2;

        const salience =
          (urgency * w.urgency +
            relevance * w.relevance +
            novelty * w.novelty +
            actionability * w.actionability) /
          totalWeight;

        return { finding, agent, salience: Number(salience.toFixed(4)) } as ScoredFinding;
      })
      .sort((a, b) => b.salience - a.salience);
  }

  reset(): void {
    this.seen.clear();
  }
}
