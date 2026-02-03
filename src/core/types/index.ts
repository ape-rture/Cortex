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
} from "./routing.js";

export type {
  TaskStatus,
  TaskPriority,
  TaskSource,
  Task,
  TaskQueue,
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
  MeetingPrepBrief,
  ContactStore,
  DecayDetector,
} from "./crm.js";

export { DEFAULT_DECAY_CONFIG } from "./crm.js";
