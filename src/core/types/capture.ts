/**
 * Capture System Types
 *
 * The typed capture system classifies incoming items (from Telegram, CLI, web)
 * into distinct types, each with its own lifecycle and destination store.
 *
 * Entry points:
 * - Telegram: async capture → queue.md → triage agent → typed store
 * - CLI /capture: interactive → direct to typed store (or LLM classify if untagged)
 * - Web terminal /capture: same as CLI
 *
 * Design source: plans/serialized-chasing-naur.md
 */

// ---------------------------------------------------------------------
// Capture type — what kind of item was captured
// ---------------------------------------------------------------------

export type CaptureType =
  | "research"        // Something to investigate (tweet, article, concept, tool)
  | "content_idea"    // Idea for content creation (post, thread, article)
  | "project_task"    // Task for an existing project
  | "cortex_feature"  // Feature/improvement for Cortex itself
  | "project_seed"    // Potential new project idea
  | "action_item"     // Personal task, errand, follow-up
  | "needs_review";   // Ambiguous — needs human classification

/**
 * Tag prefixes recognized in capture input.
 * Used by both CLI and Telegram parsers.
 */
export const CAPTURE_TAG_MAP: Record<string, CaptureType> = {
  "#research": "research",
  "#content": "content_idea",
  "#task": "project_task",
  "#feature": "cortex_feature",
  "#seed": "project_seed",
  "#action": "action_item",
  // CLI subcommand aliases (without #)
  research: "research",
  content: "content_idea",
  task: "project_task",
  feature: "cortex_feature",
  seed: "project_seed",
  action: "action_item",
};

// ---------------------------------------------------------------------
// Capture source — where it came from
// ---------------------------------------------------------------------

export type CaptureSource = "telegram" | "cli" | "slack" | "agent" | "web";

// ---------------------------------------------------------------------
// Research Queue
// Storage: actions/research-queue.md
// ---------------------------------------------------------------------

export type ResearchStatus = "captured" | "researching" | "done" | "archived";

export interface ResearchItem {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly sourceUrl?: string;
  readonly sourceRef?: string;
  readonly tags?: readonly string[];
  status: ResearchStatus;
  readonly capturedAt: string;
  readonly updatedAt: string;
  readonly source: CaptureSource;
  readonly result?: string;
}

export interface ResearchStore {
  load(): Promise<readonly ResearchItem[]>;
  save(items: readonly ResearchItem[]): Promise<void>;
  add(item: Omit<ResearchItem, "id" | "capturedAt" | "updatedAt">): Promise<string>;
  updateStatus(id: string, status: ResearchStatus, result?: string): Promise<void>;
  listByStatus(status: ResearchStatus): Promise<readonly ResearchItem[]>;
}

// ---------------------------------------------------------------------
// Feature Proposals
// Storage: projects/feature-proposals.md
// ---------------------------------------------------------------------

export type FeatureStatus = "proposed" | "planned" | "assigned" | "done" | "rejected";

export interface FeatureProposal {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly rationale?: string;
  status: FeatureStatus;
  readonly assignedTo?: string;
  readonly capturedAt: string;
  readonly updatedAt: string;
  readonly source: CaptureSource;
}

export interface FeatureStore {
  load(): Promise<readonly FeatureProposal[]>;
  save(items: readonly FeatureProposal[]): Promise<void>;
  add(item: Omit<FeatureProposal, "id" | "capturedAt" | "updatedAt">): Promise<string>;
  updateStatus(id: string, status: FeatureStatus): Promise<void>;
}

// ---------------------------------------------------------------------
// Project Seeds (Ideas)
// Storage: projects/ideas.md
// ---------------------------------------------------------------------

export type SeedStatus = "seed" | "evaluating" | "accepted" | "parked" | "rejected";

export interface ProjectSeed {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly category?: string;
  status: SeedStatus;
  readonly tags?: readonly string[];
  readonly capturedAt: string;
  readonly updatedAt: string;
  readonly source: CaptureSource;
}

export interface IdeaStore {
  load(): Promise<readonly ProjectSeed[]>;
  save(items: readonly ProjectSeed[]): Promise<void>;
  add(item: Omit<ProjectSeed, "id" | "capturedAt" | "updatedAt">): Promise<string>;
  updateStatus(id: string, status: SeedStatus): Promise<void>;
  listByCategory(category: string): Promise<readonly ProjectSeed[]>;
}
