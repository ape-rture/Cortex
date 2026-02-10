/**
 * Cortex Core Types
 *
 * Barrel export for all type definitions.
 * Import from "@cortex/core/types" or "./types/index.js"
 */

export type {
  Finding,
  FindingType,
  Urgency,
  MemoryOperation,
  MemoryUpdate,
  AgentOutput,
  SalienceWeights,
  ScoredFinding,
} from "./agent-output.js";

export type {
  AgentActionKind,
  ActionPhase,
  AgentAction,
  StartedEvent,
  ActionEvent,
  CompletedEvent,
  AgentEvent,
  InterfaceType,
  EventUsageStats,
  AgentEventListener,
} from "./events.js";

export type {
  ApiPermission,
  PermissionEnvelope,
} from "./permission.js";

export type {
  Provider,
  ModelRef,
  TaskType,
  ProviderModelConfig,
  ProviderConfig,
  RouteConfig,
  FallbackRules,
  DataClassConfig,
  PolicyRule,
  RoutingConfig,
  RouteRequest,
  RouteResponse,
  Router,
  AgentAffinity,
  AgentRouteConfig,
  AgentRouteRequest,
  AgentRouteResult,
  AgentRouter,
} from "./routing.js";

export type {
  TaskStatus,
  TaskPriority,
  TaskSource,
  Task,
  TaskQueue,
  ThreadKey,
  ThreadSchedulerConfig,
  ThreadStatus,
  ThreadScheduler,
} from "./task-queue.js";

export type {
  TriggerType,
  Trigger,
  AgentSpawnConfig,
  OrchestratorCycle,
  OrchestratorConfig,
  Orchestrator,
} from "./orchestrator.js";

export type {
  SnapshotAgent,
  SessionSnapshot,
  SessionSnapshotStore,
  InterfaceOrigin,
  ResumeToken,
  ResumeTokenStore,
} from "./session.js";

export type {
  DigestItem,
  DailyDigest,
  DigestGenerator,
} from "./daily-digest.js";

export type {
  UnpushedReport,
  GitMonitor,
  GitMonitorConfig,
} from "./git-monitor.js";

export type {
  AliasCategory,
  AliasStatus,
  Alias,
  AliasSuggestion,
  PhraseOccurrence,
  AliasDetectionConfig,
  AliasStore,
  AliasPatternDetector,
} from "./alias.js";

export { DEFAULT_ALIAS_DETECTION_CONFIG } from "./alias.js";

export type {
  ContactType,
  RelationshipStatus,
  ContactInfo,
  InteractionType,
  InteractionRecord,
  Contact,
  DecayAlert,
  DecayConfig,
  CompanyNewsItem,
  MeetingPrepConfig,
  MeetingPrepBrief,
  ContactStore,
  DecayDetector,
} from "./crm.js";

export { DEFAULT_DECAY_CONFIG } from "./crm.js";

export type {
  ContentFormat,
  ContentPlatform,
  ContentStatus,
  SeedSource,
  ContentSeed,
  ContentIdea,
  DraftRevision,
  ContentDraft,
  ContentChainNode,
  ContentChain,
  PodcastEpisode,
  PodcastDistributionPack,
  PodcastDistributionGenerator,
  ContentStore,
  DraftGeneratorConfig,
  DraftGeneratorInput,
  ContentDraftGenerator,
  SeedExtractorConfig,
  SeedExtractorInput,
  ContentSeedExtractor,
} from "./content.js";

export {
  DEFAULT_DRAFT_CONFIG,
  DEFAULT_SEED_EXTRACTOR_CONFIG,
} from "./content.js";

export type {
  PageResult,
  PageLink,
  FetchTier,
  FetchPageOptions,
  CrawlOptions,
  CrawlResult,
  WebScraperConfig,
  WebScraper,
} from "./web-scraper.js";

export type {
  ProjectStatus,
  Project,
  ProjectHealthReport,
  ProjectStore,
  ProjectGitStatus,
  ProjectGitResult,
  ProjectPushOptions,
  ProjectGitOperations,
  ScaffoldConfig,
  ScaffoldResult,
  ProjectScaffolder,
} from "./project.js";

export type {
  EntityKind,
  FactCategory,
  FactSource,
  FactStatus,
  AtomicFact,
  EntitySummary,
  FactSupersession,
  EntityStore,
} from "./entity.js";

export type {
  EntityDecayConfig,
  EntityDecayAlert,
  EntityDecayDetector,
} from "./decay.js";

export { DEFAULT_ENTITY_DECAY_CONFIG } from "./decay.js";
