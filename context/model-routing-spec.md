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

## Model IDs

Provider model IDs are stored as strings in the config. Replace "TBD" with actual API ids
when credentials and model versions are finalized.
