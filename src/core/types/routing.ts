/**
 * Model Routing Types
 *
 * Types for the routing layer that abstracts LLM providers.
 * Agent code calls route(taskType, prompt) — never a specific API.
 *
 * Canonical config: context/model-routing.json
 * Design source: decisions/2026-02-02-blocking-decisions.md
 */

// ---------------------------------------------------------------------
// Provider and model identifiers
// ---------------------------------------------------------------------

export type Provider = "anthropic" | "openai" | "local";

/** Format: "provider:model_key" — e.g. "anthropic:sonnet", "openai:codex" */
export type ModelRef = `${Provider}:${string}`;

// ---------------------------------------------------------------------
// Task classification
// ---------------------------------------------------------------------

export type TaskType =
  | "quick_capture"
  | "meeting_summary"
  | "complex_reasoning"
  | "code_generation"
  | "code_review"
  | "content_drafting"
  | "research_analysis"
  | "classification"
  | "bulk_ops"
  | "security_audit"
  | "vibe_coding";

// ---------------------------------------------------------------------
// Routing configuration (mirrors model-routing.json)
// ---------------------------------------------------------------------

export interface ProviderModelConfig {
  readonly api_model_id: string;
}

export interface ProviderConfig {
  readonly enabled: boolean;
  readonly models: Record<string, ProviderModelConfig>;
}

export interface RouteConfig {
  readonly primary: ModelRef;
  readonly fallback: readonly ModelRef[];
}

export interface FallbackRules {
  readonly on_error: boolean;
  readonly on_timeout_ms: number;
  readonly on_low_confidence: boolean;
}

export interface DataClassConfig {
  readonly local_only: boolean;
  readonly examples: readonly string[];
}

export interface PolicyRule {
  readonly id: string;
  readonly description: string;
  readonly match: { readonly data_classes: readonly string[] };
  readonly allowed_providers: readonly Provider[];
  readonly requires_user_approval_for_cloud: boolean;
}

export interface RoutingConfig {
  readonly version: string;
  readonly updated_at: string;
  readonly routing_mode: "hybrid" | "static" | "dynamic";
  readonly providers: Record<Provider, ProviderConfig>;
  readonly task_types: Record<TaskType, { readonly description: string }>;
  readonly routes: Record<TaskType, RouteConfig>;
  readonly fallback_rules: FallbackRules;
  readonly data_classes: Record<string, DataClassConfig>;
  readonly policy_rules: readonly PolicyRule[];
}

// ---------------------------------------------------------------------
// Router API contract — what Codex implements
// ---------------------------------------------------------------------

export interface RouteRequest {
  /** Classified task type, or undefined if the router should classify */
  readonly task_type?: TaskType;

  /** The prompt / instruction to send to the model */
  readonly prompt: string;

  /** Optional system prompt to prepend */
  readonly system_prompt?: string;

  /** If the user explicitly requested a model, pass it here */
  readonly user_override?: ModelRef;

  /** Glob patterns of files this request touches (for data policy) */
  readonly touches_files?: readonly string[];

  /** Max tokens for the response */
  readonly max_tokens?: number;
}

export interface RouteResponse {
  /** The model that actually handled the request */
  readonly model_used: ModelRef;

  /** Whether a fallback was used (primary failed) */
  readonly used_fallback: boolean;

  /** The model's text response */
  readonly content: string;

  /** Token counts for logging */
  readonly usage: {
    readonly input_tokens: number;
    readonly output_tokens: number;
  };

  /** Wall-clock latency in milliseconds */
  readonly latency_ms: number;
}

/**
 * Router interface.
 *
 * The routing layer wraps @anthropic-ai/sdk and openai SDKs behind
 * a single interface. Agent code and the orchestrator call this —
 * never a provider SDK directly.
 */
export interface Router {
  /**
   * Send a prompt to the appropriate model based on routing config.
   * Handles: user override > policy rules > task classification > static routes > fallback.
   */
  route(request: RouteRequest): Promise<RouteResponse>;

  /**
   * Classify a prompt into a TaskType. Used when task_type is not
   * provided in the request.
   */
  classify(prompt: string): Promise<{ task_type: TaskType; confidence: number }>;

  /** Reload routing config from disk (context/model-routing.json) */
  reloadConfig(): Promise<void>;
}
