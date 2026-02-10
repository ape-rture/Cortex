/**
 * Generalized Entity Decay Types
 *
 * Extends the contact-specific DecayDetector pattern (src/core/types/crm.ts)
 * to work across all knowledge graph entity kinds.
 *
 * The existing SimpleDecayDetector (contact-only) stays as-is.
 * A future EntityDecayDetector will use these types to monitor
 * staleness across people, companies, projects, and topics.
 */

import type { EntityKind } from "./entity.js";

// ---------------------------------------------------------------------
// Entity decay configuration
// ---------------------------------------------------------------------

/**
 * Configuration for entity-level decay detection.
 */
export interface EntityDecayConfig {
  /** Which entity kinds to monitor for staleness */
  readonly entityKinds: readonly EntityKind[];

  /** Days without updates before flagging an entity as stale */
  readonly thresholdDays: number;

  /** Maximum alerts to return */
  readonly maxAlerts: number;
}

/**
 * Default entity decay detection configuration.
 */
export const DEFAULT_ENTITY_DECAY_CONFIG: EntityDecayConfig = {
  entityKinds: ["people", "companies"],
  thresholdDays: 30,
  maxAlerts: 15,
};

// ---------------------------------------------------------------------
// Entity decay alert
// ---------------------------------------------------------------------

/**
 * An alert for an entity that hasn't received new facts recently.
 */
export interface EntityDecayAlert {
  /** Kind of entity (people, companies, projects, topics) */
  readonly entityKind: EntityKind;

  /** Entity slug ID */
  readonly entityId: string;

  /** Display name */
  readonly entityName: string;

  /** ISO-8601 timestamp of last update */
  readonly lastUpdated: string;

  /** Days since the entity was last updated */
  readonly daysSinceUpdate: number;

  /** Specific facts that may be outdated (status facts older than threshold) */
  readonly staleFacts: readonly string[];

  /** Suggested action to refresh this entity's knowledge */
  readonly suggestedAction: string;
}

// ---------------------------------------------------------------------
// Entity decay detector interface
// ---------------------------------------------------------------------

/**
 * Interface for detecting stale entities across the knowledge graph.
 */
export interface EntityDecayDetector {
  /** Scan entities and return decay alerts */
  detectDecay(config?: Partial<EntityDecayConfig>): Promise<readonly EntityDecayAlert[]>;
}
