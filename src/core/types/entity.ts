/**
 * Knowledge Graph Entity Types
 *
 * Types for the Memory Flywheel (Phase 5.5): entity-based knowledge graph
 * with atomic facts and living summaries.
 *
 * Storage:
 * - entities/{kind}/{id}/summary.md (living summary, rewritten by synthesis)
 * - entities/{kind}/{id}/facts.json  (append-only atomic facts)
 *
 * Architecture: research/03-clawdbot-memory-system.md (three-layer model)
 * Phase 5.5 roadmap: projects/feature-roadmap.md
 */

// ---------------------------------------------------------------------
// Entity classification
// ---------------------------------------------------------------------

/**
 * Kind of entity in the knowledge graph.
 * Maps to top-level directories under entities/.
 */
export type EntityKind = "people" | "companies" | "projects" | "topics";

// ---------------------------------------------------------------------
// Atomic fact schema (Layer 1 — items.json)
// ---------------------------------------------------------------------

/**
 * Category of an atomic fact.
 * - relationship: How entities relate to each other or to the user
 * - milestone: Events, achievements, life changes
 * - status: Current state (job title, location, project phase)
 * - preference: Likes, dislikes, communication style, tools
 */
export type FactCategory = "relationship" | "milestone" | "status" | "preference";

/**
 * How an atomic fact was captured.
 */
export type FactSource = "conversation" | "extraction" | "meeting" | "manual";

/**
 * Lifecycle status of a fact.
 * Facts are never deleted — they are superseded by newer facts.
 */
export type FactStatus = "active" | "superseded";

/**
 * An atomic fact — the smallest unit of durable knowledge.
 * Stored in entities/{kind}/{id}/facts.json as an append-only array.
 *
 * Design principles:
 * - One clear sentence per fact
 * - Never deleted, only superseded
 * - Timestamped and sourced for provenance
 * - Confidence-scored by the extractor agent
 */
export interface AtomicFact {
  /** Unique identifier (crypto.randomUUID()) */
  readonly id: string;

  /** The fact itself — one clear, self-contained sentence */
  readonly fact: string;

  /** Category of knowledge this fact represents */
  readonly category: FactCategory;

  /** ISO-8601 timestamp when the fact was captured */
  readonly timestamp: string;

  /** How this fact was captured */
  readonly source: FactSource;

  /** Reference to the source material (file path, meeting name, URL) */
  readonly sourceRef?: string;

  /** Extractor confidence score (0.0–1.0) */
  readonly confidence: number;

  /** Whether this fact is still current or has been superseded */
  readonly status: FactStatus;

  /** ID of the newer fact that supersedes this one */
  readonly supersededBy?: string;
}

// ---------------------------------------------------------------------
// Entity summary (Layer 1 — summary.md front matter + body)
// ---------------------------------------------------------------------

/**
 * An entity summary — the always-current view of an entity.
 * Stored as entities/{kind}/{id}/summary.md with YAML-like front matter.
 *
 * Rewritten weekly by the memory-synthesizer agent.
 * Agents load summaries first (cheap), drill into facts.json only when needed.
 */
export interface EntitySummary {
  /** Slug identifier (e.g., "sarah-chen", "acme-corp") */
  readonly id: string;

  /** Entity kind (matches parent directory) */
  readonly kind: EntityKind;

  /** Display name (e.g., "Sarah Chen", "Acme Corp") */
  readonly name: string;

  /** Living narrative — the body of summary.md */
  readonly summary: string;

  /** ISO-8601 timestamp of last summary update */
  readonly lastUpdated: string;

  /** Total number of facts in facts.json */
  readonly factCount: number;

  /** Number of non-superseded (active) facts */
  readonly activeFactCount: number;

  /** Optional tags for filtering and discovery */
  readonly tags?: readonly string[];
}

// ---------------------------------------------------------------------
// Entity store interface
// ---------------------------------------------------------------------

/**
 * Fact supersession instruction — used by the weekly synthesizer
 * to mark old facts as replaced by newer ones.
 */
export interface FactSupersession {
  /** ID of the fact being superseded */
  readonly factId: string;
  /** ID of the newer fact that replaces it */
  readonly supersededBy: string;
}

/**
 * Interface for reading and writing entity knowledge graph data.
 * Implementations should be file-backed (markdown + JSON).
 *
 * Follows the same pattern as ContactStore and ContentStore.
 */
export interface EntityStore {
  /** List all entity IDs for a given kind */
  listEntities(kind: EntityKind): Promise<readonly string[]>;

  /** Load entity summary (returns null if entity doesn't exist) */
  loadSummary(kind: EntityKind, id: string): Promise<EntitySummary | null>;

  /** Load all facts for an entity */
  loadFacts(kind: EntityKind, id: string): Promise<readonly AtomicFact[]>;

  /** Load only active (non-superseded) facts */
  loadActiveFacts(kind: EntityKind, id: string): Promise<readonly AtomicFact[]>;

  /** Append new facts to an entity's facts.json (creates entity if needed) */
  appendFacts(kind: EntityKind, id: string, facts: readonly AtomicFact[]): Promise<void>;

  /** Mark facts as superseded (weekly synthesis) */
  supersedeFacts(kind: EntityKind, id: string, supersessions: readonly FactSupersession[]): Promise<void>;

  /** Write or overwrite an entity's summary.md */
  writeSummary(kind: EntityKind, id: string, summary: EntitySummary): Promise<void>;

  /** Create a new entity with an empty facts.json and template summary */
  createEntity(kind: EntityKind, id: string, name: string): Promise<void>;
}
