# Task Board

*Dennis assigns tasks here. Agents pick up their assigned work.*

---

## Queued

*Add tasks with `Agent: claude` or `Agent: codex` to assign.*

- **Add /digest command to web terminal** -- Agent: codex -- Wire `/digest` in `src/ui/handlers/chat.ts` same pattern as `/gm`. Import `runDailyDigest()` from `src/cli/digest.ts`, add `isDigestCommand()` check, return with `modelUsed: "local:digest"`.

- **Hybrid mode for /gm command** -- Agent: codex -- Extend `/gm` in `src/ui/handlers/chat.ts` to support LLM interpretation. Requirements:
  - `/gm` (no args) → return raw briefing as now
  - `/gm <instruction>` (e.g., `/gm summarize`, `/gm priorities`, `/gm blockers`) → fetch briefing, then pass to LLM via ConfigRouter with prompt: "Here's my morning briefing:\n\n{briefing}\n\nUser request: {instruction}"
  - Use a simple system prompt like "You're a personal assistant. Help with the user's request based on their briefing."
  - Return `modelUsed: "hybrid:gm+{model}"` to show it used both local data and LLM

- **Phase 2c: Implement MeetingPrepGenerator** -- Agent: codex -- Create `src/core/meeting-prep.ts` implementing `MeetingPrepGenerator` interface from `src/core/types/crm.ts`. Requirements:
  - Constructor takes `ContactStore`, `TaskQueue`, and `ConfigRouter`
  - `generateBrief(query)` searches for contact, gets recent interactions (max 5), searches task queue for action items mentioning contact name/company
  - Calls LLM via ConfigRouter with prompt from `src/agents/prompts/meeting-prep.md` to generate talking points
  - Returns `MeetingPrepBrief` with contact, interactions, action items, LLM-generated talking points
  - Add unit tests (mock the ConfigRouter LLM call)

- **Phase 2c: Create /prep CLI command** -- Agent: codex -- Create `src/cli/prep.ts` for meeting prep. Requirements:
  - Takes contact name as CLI argument: `npm run prep "Arjun"`
  - Instantiates MeetingPrepGenerator with real stores and router
  - Outputs formatted brief to console (similar to /gm format)
  - Add npm script `"prep": "node --import tsx src/cli/prep.ts"` to package.json
  - Handle errors gracefully (contact not found, LLM failure)

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
- **Phase 2a: Enhance contact parser** -- Agent: codex -- Branch: `codex/contact-parser`. Updated parseContactFile to full CRM template + serializeContact; tests added.
- **Phase 2a: Create ContactStore** -- Agent: codex -- Branch: `codex/contact-parser`. Added MarkdownContactStore + tests.
- **Phase 2b: Decay detector + /gm** -- Agent: codex -- Branch: `codex/decay-detector`. Added SimpleDecayDetector + /gm Relationship Alerts section + tests.
