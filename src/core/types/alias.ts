/**
 * Alias System Types
 *
 * Shorthand/alias system for reducing typing and tokens.
 * Aliases emerge from patterns -- Cortex suggests, user approves.
 */

/**
 * Category of alias.
 * - command: triggers a skill/action (gm, eod, prep)
 * - entity: shorthand for people/companies/projects (ixco -> Indexing Co)
 * - phrase: common expressions (lgtm -> looks good to me)
 * - path: file/folder shortcuts (ctx -> context/)
 * - status: state indicators (wip, blocked, done)
 */
export type AliasCategory = "command" | "entity" | "phrase" | "path" | "status";

/**
 * Status of an alias in the system.
 * - active: confirmed by user, used for expansion
 * - suggested: detected by pattern analysis, awaiting approval
 * - rejected: user declined, don't suggest again
 * - deprecated: was active, now replaced or unused
 */
export type AliasStatus = "active" | "suggested" | "rejected" | "deprecated";

/**
 * An alias definition.
 */
export interface Alias {
  /** The shorthand (e.g., "gm", "ixco") */
  readonly alias: string;

  /** What it expands to (e.g., "good morning", "Indexing Co") */
  readonly expansion: string;

  /** Category for grouping and context-aware expansion */
  readonly category: AliasCategory;

  /** Current status */
  readonly status: AliasStatus;

  /** ISO date when added/suggested */
  readonly addedAt: string;

  /** Number of times used (for active) or seen (for suggested) */
  readonly usageCount: number;

  /** Optional notes about the alias */
  readonly notes?: string;
}

/**
 * A suggested alias detected from usage patterns.
 */
export interface AliasSuggestion {
  /** The proposed shorthand */
  readonly suggestedAlias: string;

  /** The full phrase it would replace */
  readonly expansion: string;

  /** Detected category */
  readonly category: AliasCategory;

  /** How many times the pattern was observed */
  readonly occurrences: number;

  /** ISO date of first observation */
  readonly firstSeen: string;

  /** ISO date of most recent observation */
  readonly lastSeen: string;

  /** Context where it was observed (e.g., "morning briefing", "meeting prep") */
  readonly contexts: readonly string[];
}

/**
 * Phrase occurrence tracked for pattern detection.
 */
export interface PhraseOccurrence {
  /** The phrase (normalized to lowercase) */
  readonly phrase: string;

  /** Number of occurrences */
  readonly count: number;

  /** ISO dates of occurrences */
  readonly dates: readonly string[];

  /** Contexts where observed */
  readonly contexts: readonly string[];
}

/**
 * Configuration for alias detection.
 */
export interface AliasDetectionConfig {
  /** Minimum phrase length (words) to consider for aliasing */
  readonly minPhraseWords: number;

  /** Minimum occurrences before suggesting an alias */
  readonly minOccurrences: number;

  /** Time window for occurrence counting (days) */
  readonly windowDays: number;

  /** Maximum suggestions to surface at once */
  readonly maxSuggestions: number;
}

/**
 * Default detection configuration.
 */
export const DEFAULT_ALIAS_DETECTION_CONFIG: AliasDetectionConfig = {
  minPhraseWords: 3,
  minOccurrences: 3,
  windowDays: 7,
  maxSuggestions: 5,
};

/**
 * Interface for the alias store.
 */
export interface AliasStore {
  /** Load all aliases from storage */
  load(): Promise<readonly Alias[]>;

  /** Get active aliases only */
  getActive(): Promise<readonly Alias[]>;

  /** Get suggested aliases awaiting approval */
  getSuggested(): Promise<readonly AliasSuggestion[]>;

  /** Add a new alias (active or suggested) */
  add(alias: Alias): Promise<void>;

  /** Approve a suggested alias (moves to active) */
  approve(aliasText: string): Promise<void>;

  /** Reject a suggested alias */
  reject(aliasText: string): Promise<void>;

  /** Increment usage count for an alias */
  recordUsage(aliasText: string): Promise<void>;

  /** Expand an alias if it exists and is active */
  expand(text: string): Promise<string>;

  /** Save all changes */
  save(): Promise<void>;
}

/**
 * Interface for the pattern detector.
 */
export interface AliasPatternDetector {
  /** Record a phrase occurrence for pattern tracking */
  recordPhrase(phrase: string, context: string): void;

  /** Analyze recorded phrases and return suggestions */
  analyze(config?: AliasDetectionConfig): AliasSuggestion[];

  /** Clear recorded phrases (e.g., after analysis) */
  clear(): void;
}
