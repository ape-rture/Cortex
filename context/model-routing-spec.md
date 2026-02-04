# Model Routing Spec

This document defines the canonical routing config schema in `context/model-routing.json`.

## Required Fields

- version: Schema version string.
- updated_at: Last update date (YYYY-MM-DD).
- routing_mode: "hybrid" (user override + classifier + static routes).
- user_override: { enabled, priority, examples[] }.
- classifier: { enabled, model, confidence_threshold, fallback_on_low_confidence }.
- data_classes: Map of sensitive categories with local_only and example paths.
- policy_rules: Ordered list of routing constraints.
- providers: Provider registry with model ids.
- task_types: Canonical task taxonomy.
- routes: Task type to primary and fallback models.
- fallback_rules: Global fallback triggers.
- logging: Log destination and fields.

## Task Type Classification Guidance

- quick_capture: short notes, filing, simple transforms
- meeting_summary: meeting minutes, action extraction, transcript summaries
- complex_reasoning: multi-step planning, architecture, difficult tradeoffs
- code_generation: implementation, refactors, new modules
- code_review: review, critique, testing gaps
- content_drafting: posts, threads, longform drafts
- research_analysis: synthesis, comparative analysis, structured research
- classification: routing, tagging, triage only
- bulk_ops: large batch operations, formatting
- security_audit: threat modeling, security reviews
- vibe_coding: interactive coding sessions

## Data Policy Rules

If a task touches any local-only data class, routing must be restricted to local providers.
If cloud processing is required, create a redacted summary and ask for explicit approval.

## Agent Routing (Phase 5+)

Agent routing sits above model routing. It determines which runtime agent handles a task
before model routing decides which LLM the agent uses.

Cascade: user directive > context match > task type affinity > default agent.

### Schema

```
agent_routing:
  default_agent: string              # Fallback agent when nothing matches
  user_directives:                   # Optional map of slash-command prefixes to agents
    "/sales": "sales-watcher"
    "/content": "content-creator"
  affinities:                        # Ordered list, higher priority wins
    - agent: string                  # Agent identifier
      task_types: string[]           # Which task types this agent handles
      priority: number               # Higher = preferred when multiple match
      context_match?: string         # Glob pattern for file-context matching
      model_override?: string        # Override model for this agent+task combo
```

### Example Config

```json
{
  "agent_routing": {
    "default_agent": "triage",
    "user_directives": {
      "/sales": "sales-watcher",
      "/content": "content-creator"
    },
    "affinities": [
      {
        "agent": "triage",
        "task_types": ["quick_capture", "classification"],
        "priority": 10
      },
      {
        "agent": "content-creator",
        "task_types": ["content_drafting"],
        "priority": 10
      },
      {
        "agent": "sales-watcher",
        "task_types": ["research_analysis"],
        "priority": 5,
        "context_match": "contacts/*"
      }
    ]
  }
}
```

TypeScript types: `AgentAffinity`, `AgentRouteConfig`, `AgentRouteRequest`, `AgentRouteResult`, `AgentRouter` in `src/core/types/routing.ts`.

Design source: `research/12-takopi-telegram-bridge.md` (Takopi AutoRouter pattern).

## Model IDs

Provider model IDs are stored as strings in the config. Replace "TBD" with actual API ids
when credentials and model versions are finalized.
