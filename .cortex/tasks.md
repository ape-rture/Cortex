# Task Board

*Dennis assigns tasks here. Agents pick up their assigned work.*

---

## Queued

*Add tasks with `Agent: claude` or `Agent: codex` to assign.*
<!-- Example:
- **Build Slack queue bot** -- Agent: codex -- Create minimal Slack bot that appends messages from #cortex to /actions/queue.md. See decisions/2026-02-02-blocking-decisions.md for specs.
-->
- **Phase 2a: Enhance contact parser** -- Agent: codex -- Enhance `parseContactFile` in `src/utils/markdown.ts` to parse full contact template (contactInfo, relationshipStatus, lastContact, nextFollowUp, proper history format). Add `serializeContact` function. Types at `src/core/types/crm.ts`. Test contact at `contacts/arjun-mukherjee.md`. Branch: `codex/contact-parser`.
- **Phase 2a: Create ContactStore** -- Agent: codex -- Implement `ContactStore` interface from `src/core/types/crm.ts` in `src/utils/contact-store.ts`. CRUD for contact files, search by name/email/attioId. Add tests. Depends on: enhanced contact parser. Branch: `codex/contact-store`.
- **Phase 2b: Decay detector + /gm** -- Agent: codex -- Implement `DecayDetector` in `src/core/decay-detector.ts`. Scan contacts, find those with lastContact > 30 days. Add "Relationship Alerts" section to `/gm`. Add tests. Depends on: ContactStore. Branch: `codex/decay-detector`.

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
- **Add tests for core modules** -- Agent: codex -- Branch: `codex/core-tests`. Added node:test suites for markdown utils, task queue, and routing.
- **Finalize provider model IDs** -- Agent: codex -- Branch: `codex/routing-config`. Finalized model IDs in context/model-routing.json, added validation script.
- **Define how other LLM agents participate** -- Agent: claude -- Added "Adding a New LLM Agent" section to CONVENTIONS.md covering instruction files, registration, coordination, and safe edit boundaries.
- **Document redaction flow for local-only data** -- Agent: claude -- Added redaction workflow to context/model-routing.md: identify, redact with typed placeholders, send, rehydrate, discard map.
- **Multi-calendar support for /gm** -- Agent: codex -- Branch: `codex/multi-calendar`. Added GOOGLE_CALENDAR_IDS support and calendar source display.
- **Implement session snapshot store** -- Agent: codex -- Branch: `codex/session-snapshot`. Added MarkdownSessionSnapshotStore with snapshot parser/serializer and tests.
- **Implement daily digest generator** -- Agent: codex -- Branch: `codex/daily-digest`. Added MarkdownDigestGenerator, CLI entrypoint, and tests.
- **Implement git push monitor** -- Agent: codex -- Branch: `codex/git-monitor`. Added SimpleGitMonitor with unpushed commit detection, /gm Git section, and tests.
- **Wire snapshot into /gm** -- Agent: codex -- Branch: `codex/git-monitor`. Added snapshot load to /gm and "Picking Up Where We Left Off" section.
- **Implement alias store and detector** -- Agent: codex -- Branch: `codex/alias-system`. Added MarkdownAliasStore, SimpleAliasPatternDetector, and tests.
- **Web terminal: server foundation** -- Agent: codex -- Branch: `codex/web-terminal`. Added Hono server, in-memory store, static serving, and `dev:ui` script.
- **Web terminal: API endpoints** -- Agent: codex -- Branch: `codex/web-terminal`. Added session CRUD + chat SSE, wired ConfigRouter + SYSTEM.md prompt.
