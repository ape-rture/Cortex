# Task Board

*Dennis assigns tasks here. Agents pick up their assigned work.*

---

## Queued

*Add tasks with `Agent: claude` or `Agent: codex` to assign.*
<!-- Example:
- **Build Slack queue bot** -- Agent: codex -- Create minimal Slack bot that appends messages from #cortex to /actions/queue.md. See decisions/2026-02-02-blocking-decisions.md for specs.
-->
- **Wire /gm entrypoint** -- Agent: codex -- Add a runnable CLI entrypoint that uses markdown utils + calendar integration to produce a morning briefing. Branch: `codex/gm-entrypoint`. Depends on: google-calendar.
- **Add tests for core modules** -- Agent: codex -- Tests for markdown utils, task queue, routing. Branch: `codex/core-tests`. Depends on: routing, task-queue, markdown-utils.

## In Progress

*Agent moves task here when starting.*

*No tasks currently in progress.*

## Done

- **Phase 1 contracts: types, schemas, /gm skill** -- Agent: claude -- Branch: `claude/phase1-contracts`. Created all TypeScript interfaces (agent output, routing, task queue, orchestrator, permissions) and /gm skill prompt.
- **Scaffold TypeScript project** -- Agent: codex -- Branch: `codex/project-scaffold`. Added package.json, tsconfig.json, and ensured src structure (integrations/utils placeholders).
- **Implement markdown read/write utils** -- Agent: codex -- Branch: `codex/markdown-utils`. Added markdown helpers for queue parsing/serialization, contact parsing, and file IO.
- **Implement task queue processor** -- Agent: codex -- Branch: `codex/task-queue`. Added MarkdownTaskQueue with read/write, add, update, next helpers.
- **Implement routing layer** -- Agent: codex -- Branch: `codex/routing-layer`. Added ConfigRouter with config load, policy rules, fallback chain, provider calls, and performance logging.
- **Implement Google Calendar integration** -- Agent: codex -- Branch: `codex/google-calendar`. Added googleapis-based integration to fetch today's events.
- **Wire /gm entrypoint** -- Agent: codex -- Branch: `codex/gm-entrypoint`. Added CLI entrypoint for morning briefing.
- **Implement Google Calendar integration** -- Agent: codex -- Branch: `codex/google-calendar`. Added googleapis-based integration to fetch today's events.
