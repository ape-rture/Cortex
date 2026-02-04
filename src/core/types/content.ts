/**
 * Content Pipeline Types
 *
 * Types for the content lifecycle: idea tracking, drafting, seed extraction,
 * podcast distribution, and cross-platform content recycling.
 *
 * Storage:
 * - projects/content-ideas.md (idea table)
 * - projects/content-drafts/{id}.md (draft files)
 * - projects/content-seeds.md (extracted seeds)
 * - projects/content-chains.md (recycling chains)
 *
 * Design source: SYSTEM.md (Content Pipeline & Recycling section)
 * Phase 3 roadmap: projects/feature-roadmap.md
 */

// ---------------------------------------------------------------------
// Content format and platform
// ---------------------------------------------------------------------

/**
 * Content format type.
 */
export type ContentFormat =
  | "thread"          // Multi-post thread (X/Twitter)
  | "post"            // Single post (X, LinkedIn)
  | "article"         // Long-form article or blog post
  | "newsletter"      // Newsletter snippet/issue
  | "video_script"    // YouTube video script or outline
  | "podcast_episode" // Podcast episode (title, description, distribution)
  | "other";

/**
 * Target platform for content.
 */
export type ContentPlatform =
  | "x"               // X/Twitter
  | "linkedin"        // LinkedIn
  | "youtube"         // YouTube
  | "spotify"         // Spotify (podcast)
  | "newsletter"      // Newsletter
  | "blog"            // Blog/website
  | "internal"        // Internal use only
  | "multi";          // Multiple platforms (cross-posted)

/**
 * Lifecycle status of a content idea.
 * Flow: idea -> outline -> draft -> review -> approved -> published
 * Can also go to: killed (dropped) at any stage.
 */
export type ContentStatus =
  | "idea"            // Raw idea captured, no work done
  | "outline"         // Structure/outline created
  | "draft"           // Draft written, needs review
  | "review"          // Under review / iterating
  | "approved"        // Approved by Dennis, ready to publish
  | "published"       // Live on platform
  | "killed";         // Dropped / not pursuing

// ---------------------------------------------------------------------
// Content Seed — extracted insight that could become content
// ---------------------------------------------------------------------

/**
 * Source type for a content seed.
 */
export type SeedSource =
  | "meeting"         // Extracted from meeting transcript
  | "conversation"    // From Slack, Telegram, or other conversation
  | "reading"         // From an article, paper, or report
  | "observation"     // Dennis's own observation or thought
  | "existing"        // Recycled from existing content (post, video, etc.)
  | "granola"         // Extracted from Granola transcript URL
  | "manual";         // Manually entered

/**
 * A content seed — a raw insight or observation that could become content.
 * Seeds are the input to the content pipeline. They come from meetings,
 * conversations, existing content, and manual capture.
 */
export interface ContentSeed {
  /** Unique seed identifier (e.g., "seed-2026-02-04-001") */
  readonly id: string;

  /** The core insight or observation (1-3 sentences) */
  readonly insight: string;

  /** Where this seed came from */
  readonly source: SeedSource;

  /** Reference to source material (file path, URL, or description) */
  readonly sourceRef?: string;

  /** Contact associated with this insight (e.g., meeting participant) */
  readonly contactRef?: string;

  /** Suggested content angles or formats */
  readonly suggestedAngles?: readonly string[];

  /** ISO-8601 date when seed was captured */
  readonly capturedAt: string;

  /** Whether this seed has been converted to a ContentIdea */
  readonly promoted: boolean;

  /** ID of the ContentIdea this was promoted to, if any */
  readonly promotedToId?: string;
}

// ---------------------------------------------------------------------
// Content Idea — tracked item in content-ideas.md
// ---------------------------------------------------------------------

/**
 * A content idea — the core entity in the pipeline.
 * Maps to a row in projects/content-ideas.md.
 *
 * Table columns: | ID | Date | Topic | Format | Platform | Status | Source | Notes |
 */
export interface ContentIdea {
  /** Unique identifier (e.g., "content-001") */
  readonly id: string;

  /** ISO-8601 date when the idea was captured */
  readonly date: string;

  /** Topic / title of the content idea */
  readonly topic: string;

  /** Target format */
  readonly format: ContentFormat;

  /** Target platform */
  readonly platform: ContentPlatform;

  /** Current lifecycle status */
  status: ContentStatus;

  /** Where this idea came from (seed ID, "manual", meeting ref, etc.) */
  readonly source?: string;

  /** Free-form notes */
  readonly notes?: string;

  /** Tags for filtering */
  readonly tags?: readonly string[];
}

// ---------------------------------------------------------------------
// Content Draft — WIP text with revision history
// ---------------------------------------------------------------------

/**
 * A single revision of a content draft.
 */
export interface DraftRevision {
  /** Revision number (1-indexed) */
  readonly version: number;

  /** ISO-8601 timestamp of this revision */
  readonly timestamp: string;

  /** The draft text for this revision */
  readonly text: string;

  /** What changed in this revision */
  readonly changeNote?: string;

  /** Who/what generated this revision */
  readonly author: "llm" | "manual" | "edit";
}

/**
 * A content draft — the work-in-progress text for a ContentIdea.
 * Stored as a markdown file in projects/content-drafts/{id}.md.
 */
export interface ContentDraft {
  /** ID matching the ContentIdea this draft belongs to */
  readonly ideaId: string;

  /** Target format (denormalized from ContentIdea for convenience) */
  readonly format: ContentFormat;

  /** Target platform (denormalized) */
  readonly platform: ContentPlatform;

  /** The current (latest) draft text */
  readonly currentText: string;

  /** Full revision history (newest first) */
  readonly revisions: readonly DraftRevision[];

  /** Structured thread posts (only for format === "thread") */
  readonly threadPosts?: readonly string[];

  /** ISO-8601 timestamp of last update */
  readonly updatedAt: string;

  /** Feedback notes from review */
  readonly reviewNotes?: readonly string[];
}

// ---------------------------------------------------------------------
// Content Chain — cross-platform recycling tracker
// ---------------------------------------------------------------------

/**
 * A node in a content chain — tracks derivation relationships.
 * Example: podcast episode -> YouTube desc + @indexingco tweet + @ape_rture post
 */
export interface ContentChainNode {
  /** ContentIdea ID */
  readonly ideaId: string;

  /** Platform this version targets */
  readonly platform: ContentPlatform;

  /** Format of this version */
  readonly format: ContentFormat;

  /** ISO-8601 date of publication (if published) */
  readonly publishedAt?: string;

  /** URL of the published content (if available) */
  readonly url?: string;
}

/**
 * A content chain — links original content to its derivatives.
 * Tracks the "podcast episode -> YouTube desc + tweet + longform" chain.
 */
export interface ContentChain {
  /** Unique chain identifier */
  readonly chainId: string;

  /** The original/root content that started the chain */
  readonly root: ContentChainNode;

  /** Derived content (in derivation order) */
  readonly derivatives: readonly ContentChainNode[];

  /** ISO-8601 date when chain was started */
  readonly createdAt: string;
}

// ---------------------------------------------------------------------
// Podcast distribution (Block by Block)
// ---------------------------------------------------------------------

/**
 * Podcast episode metadata — input for distribution pack generation.
 * Based on block-by-block-distribution.md template.
 */
export interface PodcastEpisode {
  /** Episode number */
  readonly episodeNumber: number;

  /** Episode title (e.g., "Block by Block Ep. 5: The Data Layer") */
  readonly title: string;

  /** Guest name */
  readonly guestName: string;

  /** Guest X/Twitter handle (e.g., "@handle") */
  readonly guestHandle?: string;

  /** Guest's company name */
  readonly guestCompany?: string;

  /** Guest's company X handle or URL */
  readonly guestCompanyHandle?: string;

  /** Guest's website URL */
  readonly guestWebsite?: string;

  /** Key discussion topics and episode notes */
  readonly notes: string;

  /** Relevant URLs (product pages, docs, demos, related threads) */
  readonly links: readonly string[];
}

/**
 * The three coordinated outputs from a podcast episode.
 * Generated together to ensure consistency across platforms.
 */
export interface PodcastDistributionPack {
  /** References the ContentIdea for this episode */
  readonly episodeId: string;

  /** YouTube video description (150-300 words, SEO-friendly, includes links section) */
  readonly youtubeDescription: string;

  /** Tweet from @indexingco (200-280 chars, punchy hook + guest mention + link) */
  readonly companyTweet: string;

  /** Longform post from @ape_rture (150-400 words, reflective, broader context) */
  readonly personalPost: string;

  /** ISO-8601 timestamp when generated */
  readonly generatedAt: string;
}

/**
 * Interface for generating podcast distribution packs.
 */
export interface PodcastDistributionGenerator {
  /**
   * Generate all three distribution outputs for a podcast episode.
   */
  generatePack(episode: PodcastEpisode): Promise<PodcastDistributionPack>;
}

// ---------------------------------------------------------------------
// Content Store interface
// ---------------------------------------------------------------------

/**
 * Interface for loading and saving content ideas, drafts, and seeds.
 * Follows the same pattern as ContactStore.
 */
export interface ContentStore {
  /** Load all content ideas from projects/content-ideas.md */
  loadIdeas(): Promise<readonly ContentIdea[]>;

  /** Save all content ideas back to projects/content-ideas.md */
  saveIdeas(ideas: readonly ContentIdea[]): Promise<void>;

  /** Add a new content idea. Returns the assigned ID. */
  addIdea(idea: Omit<ContentIdea, "id">): Promise<string>;

  /** Update the status of an existing idea */
  updateIdeaStatus(id: string, status: ContentStatus): Promise<void>;

  /** Search ideas by topic (case-insensitive) */
  searchIdeas(query: string): Promise<readonly ContentIdea[]>;

  /** Filter ideas by status */
  filterByStatus(status: ContentStatus): Promise<readonly ContentIdea[]>;

  /** Filter ideas by platform */
  filterByPlatform(platform: ContentPlatform): Promise<readonly ContentIdea[]>;

  /** Load a content draft by idea ID */
  loadDraft(ideaId: string): Promise<ContentDraft | undefined>;

  /** Save a content draft */
  saveDraft(draft: ContentDraft): Promise<void>;

  /** Load all content seeds */
  loadSeeds(): Promise<readonly ContentSeed[]>;

  /** Save content seeds */
  saveSeeds(seeds: readonly ContentSeed[]): Promise<void>;

  /** Load all content chains */
  loadChains(): Promise<readonly ContentChain[]>;

  /** Save a content chain */
  saveChain(chain: ContentChain): Promise<void>;
}

// ---------------------------------------------------------------------
// Content Draft Generator interface
// ---------------------------------------------------------------------

/**
 * Configuration for draft generation.
 */
export interface DraftGeneratorConfig {
  /** Maximum thread length (posts) for thread format (default: 8) */
  readonly maxThreadLength: number;

  /** Maximum character/word count for the output */
  readonly maxLength?: number;

  /** Whether to include hashtags (default: false) */
  readonly includeHashtags: boolean;
}

/**
 * Default draft generator configuration.
 */
export const DEFAULT_DRAFT_CONFIG: DraftGeneratorConfig = {
  maxThreadLength: 8,
  includeHashtags: false,
};

/**
 * Input for generating a content draft.
 */
export interface DraftGeneratorInput {
  /** The take, topic, or angle to write about */
  readonly topic: string;

  /** Target format */
  readonly format: ContentFormat;

  /** Target platform */
  readonly platform: ContentPlatform;

  /** Optional additional context (background info, data, links) */
  readonly context?: string;

  /** Optional seed that inspired this content */
  readonly seed?: ContentSeed;

  /** Optional previous draft to iterate on (for revisions) */
  readonly previousDraft?: string;

  /** Optional feedback to incorporate in revision */
  readonly feedback?: string;
}

/**
 * Interface for generating content drafts using LLM.
 * Follows the same pattern as MeetingPrepGenerator.
 */
export interface ContentDraftGenerator {
  /**
   * Generate a content draft from a topic/take.
   * Uses the thread-builder agent prompt.
   */
  generateDraft(
    input: DraftGeneratorInput,
    config?: Partial<DraftGeneratorConfig>,
  ): Promise<ContentDraft>;

  /**
   * Revise an existing draft based on feedback.
   * Creates a new revision in the draft's history.
   */
  reviseDraft(
    draft: ContentDraft,
    feedback: string,
    config?: Partial<DraftGeneratorConfig>,
  ): Promise<ContentDraft>;
}

// ---------------------------------------------------------------------
// Content Seed Extractor interface
// ---------------------------------------------------------------------

/**
 * Configuration for seed extraction.
 */
export interface SeedExtractorConfig {
  /** Maximum seeds to extract per input (default: 5) */
  readonly maxSeeds: number;

  /** Minimum confidence threshold for a seed (0.0-1.0, default: 0.5) */
  readonly minConfidence: number;
}

/**
 * Default seed extractor configuration.
 */
export const DEFAULT_SEED_EXTRACTOR_CONFIG: SeedExtractorConfig = {
  maxSeeds: 5,
  minConfidence: 0.5,
};

/**
 * Input for seed extraction.
 */
export interface SeedExtractorInput {
  /** The raw text to extract seeds from (meeting notes, conversation, article) */
  readonly text: string;

  /** What type of source this is */
  readonly source: SeedSource;

  /** Reference to the source (file path, URL, meeting name) */
  readonly sourceRef?: string;

  /** Contact associated with this text (e.g., meeting participant) */
  readonly contactRef?: string;
}

/**
 * Interface for extracting content seeds from raw text.
 * Uses the content-extractor agent prompt.
 */
export interface ContentSeedExtractor {
  /**
   * Extract publishable content seeds from raw text.
   */
  extractSeeds(
    input: SeedExtractorInput,
    config?: Partial<SeedExtractorConfig>,
  ): Promise<readonly ContentSeed[]>;
}
