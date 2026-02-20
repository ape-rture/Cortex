/**
 * Content pipeline types.
 */

export type ContentFormat =
  | "thread"
  | "post"
  | "article"
  | "newsletter"
  | "video_script"
  | "podcast_episode"
  | "other";

export type ContentPlatform =
  | "x"
  | "linkedin"
  | "youtube"
  | "spotify"
  | "newsletter"
  | "blog"
  | "internal"
  | "multi";

/**
 * Legacy content lifecycle labels still used in some prompts/output.
 */
export type ContentStatus =
  | "idea"
  | "outline"
  | "draft"
  | "review"
  | "approved"
  | "published"
  | "killed";

export type SeedSource =
  | "meeting"
  | "conversation"
  | "reading"
  | "observation"
  | "existing"
  | "granola"
  | "manual";

export interface ContentSeed {
  readonly id: string;
  readonly insight: string;
  readonly source: SeedSource;
  readonly sourceRef?: string;
  readonly contactRef?: string;
  readonly suggestedAngles?: readonly string[];
  readonly capturedAt: string;
  readonly promoted: boolean;
  readonly promotedToId?: string;
}

export interface DraftRevision {
  readonly version: number;
  readonly timestamp: string;
  readonly text: string;
  readonly changeNote?: string;
  readonly author: "llm" | "manual" | "edit";
}

export interface ContentDraft {
  /** Queue task ID this draft belongs to. */
  readonly ideaId: string;
  readonly format: ContentFormat;
  readonly platform: ContentPlatform;
  readonly currentText: string;
  readonly revisions: readonly DraftRevision[];
  readonly threadPosts?: readonly string[];
  readonly updatedAt: string;
  readonly reviewNotes?: readonly string[];
}

export interface ContentChainNode {
  readonly ideaId: string;
  readonly platform: ContentPlatform;
  readonly format: ContentFormat;
  readonly publishedAt?: string;
  readonly url?: string;
}

export interface ContentChain {
  readonly chainId: string;
  readonly root: ContentChainNode;
  readonly derivatives: readonly ContentChainNode[];
  readonly createdAt: string;
}

export interface PodcastEpisode {
  readonly episodeNumber: number;
  readonly title: string;
  readonly guestName: string;
  readonly guestHandle?: string;
  readonly guestCompany?: string;
  readonly guestCompanyHandle?: string;
  readonly guestWebsite?: string;
  readonly notes: string;
  readonly links: readonly string[];
}

export interface PodcastDistributionPack {
  readonly episodeId: string;
  readonly youtubeDescription: string;
  readonly companyTweet: string;
  readonly personalPost: string;
  readonly generatedAt: string;
}

export interface PodcastDistributionGenerator {
  generatePack(episode: PodcastEpisode): Promise<PodcastDistributionPack>;
}

export interface ContentStore {
  loadDraft(ideaId: string): Promise<ContentDraft | undefined>;
  saveDraft(draft: ContentDraft): Promise<void>;
  loadSeeds(): Promise<readonly ContentSeed[]>;
  saveSeeds(seeds: readonly ContentSeed[]): Promise<void>;
  loadChains(): Promise<readonly ContentChain[]>;
  saveChain(chain: ContentChain): Promise<void>;
}

export interface DraftGeneratorConfig {
  readonly maxThreadLength: number;
  readonly maxLength?: number;
  readonly includeHashtags: boolean;
}

export const DEFAULT_DRAFT_CONFIG: DraftGeneratorConfig = {
  maxThreadLength: 8,
  includeHashtags: false,
};

export interface DraftGeneratorInput {
  readonly topic: string;
  readonly format: ContentFormat;
  readonly platform: ContentPlatform;
  readonly context?: string;
  readonly seed?: ContentSeed;
  readonly previousDraft?: string;
  readonly feedback?: string;
}

export interface ContentDraftGenerator {
  generateDraft(
    input: DraftGeneratorInput,
    config?: Partial<DraftGeneratorConfig>,
  ): Promise<ContentDraft>;

  reviseDraft(
    draft: ContentDraft,
    feedback: string,
    config?: Partial<DraftGeneratorConfig>,
  ): Promise<ContentDraft>;
}

export interface SeedExtractorConfig {
  readonly maxSeeds: number;
  readonly minConfidence: number;
}

export const DEFAULT_SEED_EXTRACTOR_CONFIG: SeedExtractorConfig = {
  maxSeeds: 5,
  minConfidence: 0.5,
};

export interface SeedExtractorInput {
  readonly text: string;
  readonly source: SeedSource;
  readonly sourceRef?: string;
  readonly contactRef?: string;
}

export interface ContentSeedExtractor {
  extractSeeds(
    input: SeedExtractorInput,
    config?: Partial<SeedExtractorConfig>,
  ): Promise<readonly ContentSeed[]>;
}
