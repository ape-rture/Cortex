# Task Board

*Dennis assigns tasks here. Agents pick up their assigned work.*

---

## Queued

*Add tasks with `Agent: claude` or `Agent: codex` to assign.*

### Memory Flywheel (Phase 5.5)

- **Implement MarkdownEntityStore** -- Agent: codex -- Branch: `codex/memory-flywheel`
  - New file: `src/core/entity-store.ts`
  - Implement `EntityStore` interface from `src/core/types/entity.ts`
  - Storage pattern: `entities/{kind}/{id}/summary.md` + `entities/{kind}/{id}/facts.json`
  - `listEntities()`: scan subdirectories of `entities/{kind}/`
  - `loadSummary()`: parse YAML-like front matter from `summary.md` + body as narrative
  - `loadFacts()` / `loadActiveFacts()`: read `facts.json`, optionally filter by `status: "active"`
  - `appendFacts()`: read existing `facts.json`, concat new facts, write back (create entity dir if missing)
  - `supersedeFacts()`: update `status` and `supersededBy` fields on matched fact IDs
  - `writeSummary()`: serialize `EntitySummary` back to front matter + body markdown
  - `createEntity()`: scaffold from `entities/_template-summary.md` and `entities/_template-facts.json`
  - Write tests in `src/core/entity-store.test.ts` using temp directories

- **Implement fact-extractor local agent** -- Agent: codex -- Branch: `codex/memory-flywheel`
  - New file: `src/agents/fact-extractor.ts`
  - `local_script` agent that:
    1. Scans `meetings/` and `daily/` for recent files (last 24h by mtime)
    2. Reads file contents, builds extraction input
    3. Calls `ConfigRouter.route()` with `fact_extraction` task type and the fact-extractor prompt
    4. Parses JSON response into `AtomicFact[]` grouped by entity
    5. Calls `EntityStore.appendFacts()` for each entity (creates new entities as needed)
  - Returns `AgentOutput` with findings summarizing what was extracted
  - Register in `src/agents/index.ts` (or wherever local agents are registered)

- **Implement memory-synthesizer local agent** -- Agent: codex -- Branch: `codex/memory-flywheel`
  - New file: `src/agents/memory-synthesizer.ts`
  - `local_script` agent that:
    1. Lists all entities across all kinds via `EntityStore.listEntities()`
    2. For each entity, checks if new facts exist since `summary.lastUpdated`
    3. For entities needing update: loads all active facts, builds synthesis prompt
    4. Calls `ConfigRouter.route()` with synthesis prompt
    5. Parses response: applies supersessions via `EntityStore.supersedeFacts()`, writes new summary via `EntityStore.writeSummary()`
  - Returns `AgentOutput` with findings for stale entities and update counts

- **Write entity store and agent tests** -- Agent: codex -- Branch: `codex/memory-flywheel`
  - `src/core/entity-store.test.ts`: CRUD operations, append/supersede facts, summary read/write, entity creation
  - `src/agents/fact-extractor.test.ts`: mock ConfigRouter, verify extraction parsing + entity creation
  - `src/agents/memory-synthesizer.test.ts`: mock EntityStore + ConfigRouter, verify supersession logic

### Orchestrator MVP Follow-up (Phase 5)

### Claude Code Agents (Phase 5.5)

### Web Terminal (Phase 1.5)


## In Progress

*Agent moves task here when starting.*

*No tasks currently in progress.*

## Done

- **AutoRouter + ThreadScheduler + Resume Tokens (Phase 5)** -- Agent: codex -- Branch: `codex/auto-router` (merged to `main`). Added `ConfigAgentRouter` (`src/core/agent-router.ts`) + tests, added `InMemoryThreadScheduler` (`src/core/thread-scheduler.ts`) + tests, added `FileResumeTokenStore` (`src/core/resume-token-store.ts`) + tests, and wired orchestrator fallback routing when triggers omit `agents` (`src/core/orchestrator.ts`, `src/core/orchestrator.test.ts`). Also updated trigger typing for optional `agents` in `src/core/types/orchestrator.ts` and adjusted impacted tests.
- **Project Heartbeat (Phase 4)** -- Agent: codex -- Branch: `codex/project-heartbeat`. Implemented `ProjectHeartbeatMonitor` (`src/core/project-heartbeat.ts`) + tests (`src/core/project-heartbeat.test.ts`), wired Project Health into `/gm`, added local orchestrator agent (`src/agents/project-heartbeat.ts`) + quick trigger registration (`context/orchestrator.json`), added `/api/projects/health` handler + tests (`src/ui/handlers/projects.ts`, `src/ui/handlers/projects.test.ts`), and shipped dashboard Projects view (`src/ui/dashboard/src/views/projects.tsx`) with nav + API wiring.
- **Wire /project into web terminal** -- Agent: codex -- Branch: `main`. Added `/project` command to `src/ui/handlers/chat.ts` command registry using `runProject` from `src/cli/project.ts`, with support for `/project status`, `/project list`, and `/project status <id>` (defaults empty `/project` to `status`).
- **Phase 3: Wire dashboard/monitor/review views to Phase 2 APIs** -- Agent: codex -- Branch: `main`. Implemented live data wiring in `src/ui/dashboard/src/views/dashboard.tsx`, `src/ui/dashboard/src/views/monitor.tsx`, and `src/ui/dashboard/src/views/review.tsx` using `/api/dashboard`, `/api/dashboard/cycles`, `/api/review/*`, `/api/tasks`, `/api/monitor/stream`, and `/api/orchestrate/trigger`.
- **Phase 2 dashboard backend** -- Agent: codex -- Branch: `main`. Added `src/ui/cycle-store.ts` and `src/ui/review-store.ts`; implemented `/api/dashboard`, `/api/dashboard/cycles`, `/api/review/*`, `/api/tasks`, `/api/monitor/stream`, and `/api/orchestrate/trigger`; wired a live `CortexOrchestrator` into `src/ui/server.ts`; added tests in `src/ui/cycle-store.test.ts`, `src/ui/review-store.test.ts`, and `src/ui/handlers/phase2-api.test.ts`.
- **Set up remote git backup** -- Agent: dennis + claude. Created private repo at `https://github.com/ape-rture/Cortex.git`, added as origin, pushed main.
- **Stream /orchestrate progress in web terminal SSE** -- Agent: codex -- Branch: `main`. Extended `runOrchestrate()` with `onEvent` subscription and updated `src/ui/handlers/chat.ts` to stream per-agent started/completed events during `/orchestrate`.
- **Write unit tests for orchestrator components** -- Agent: codex -- Branch: `main`. Added/validated `src/core/salience.test.ts`, `src/core/permission-validator.test.ts`, `src/core/agent-runner.test.ts`, `src/core/orchestrator.test.ts`, and added `src/core/memory-writer.test.ts` with temp-directory file operation coverage.
- **Add cron trigger support** -- Agent: codex -- Branch: `main`. Added `node-cron` dependency, created `src/core/cron-scheduler.ts` + `src/core/cron-scheduler.test.ts`, added daemon runner in `src/cli/daemon.ts`, and wired `npm run daemon`.
- **Add unit tests for claude-code-process.ts** -- Agent: codex -- Branch: `main`. Added `src/core/claude-code-process.test.ts` for `extractJsonFromText`, `normalizeFinding`, `parseAgentResult`, and success/error/max_turns output handling using a mocked SDK query stream.
- **Create more claude_code agents** -- Agent: claude -- Branch: `claude/more-agents` (merged to `main`). Designed prompts for smart-sales-watcher and triage agent, added configs to orchestrator.json, added escalation loop and cycle timeout to orchestrator.
- **Wire /orchestrate into web terminal** -- Agent: claude -- Branch: `claude/more-agents` (merged to `main`). Added `/orchestrate` command to `src/ui/handlers/chat.ts` with flag parsing. Also added cron/trigger CLI flags to orchestrate.ts.
- **Add parseProjects/serializeProjects utilities** -- Agent: codex -- Branch: `codex/project-mgmt` (merged to `main`). Added to `src/utils/markdown.ts` with project table parsing/serialization and test coverage in `src/utils/markdown.test.ts`.
- **Implement MarkdownProjectStore** -- Agent: codex -- Branch: `codex/project-mgmt` (merged to `main`). Added `src/core/project-store.ts` for registry CRUD/filter/find operations on `projects/project-registry.md`.
- **Implement SimpleProjectGit** -- Agent: codex -- Branch: `codex/project-mgmt` (merged to `main`). Added `src/core/project-git.ts` with status/fetch/pull/push and protected main/master push guard.
- **Implement TemplateScaffolder** -- Agent: codex -- Branch: `codex/project-mgmt` (merged to `main`). Added `src/core/project-scaffolder.ts` to copy `exports/llm-collab-playbook/template-root/`, replace placeholders, support `.collab/`, optional git init, and optional registry add.
- **Implement project CLI** -- Agent: codex -- Branch: `codex/project-mgmt` (merged to `main`). Added `src/cli/project.ts`, exported in `src/cli/index.ts`, and added `project` npm script in `package.json`.
- **Add project store and git tests** -- Agent: codex -- Branch: `codex/project-mgmt` (merged to `main`). Added `src/core/project-store.test.ts` and `src/core/project-git.test.ts` with temp-directory git/store fixtures.
- **Implement web scraper module** -- Agent: codex -- Branch: `codex/web-scraper`. Added tiered web scraper (`src/integrations/web-scraper.ts`), tests (`src/integrations/web-scraper.test.ts`), dependencies, and barrel export.
- **Add unit tests for new generator modules** -- Agent: codex -- Branch: `codex/phase3-content`. Added tests for `src/core/content-draft-generator.ts`, `src/core/podcast-distribution.ts`, `src/core/content-seed-extractor.ts`, and `src/integrations/granola.ts`.
- **Add content markdown utilities** -- Agent: codex -- Branch: `codex/phase3-content`. Added `parseContentIdeas`, `serializeContentIdeas`, `parseContentDraft`, `serializeContentDraft`, `parseContentSeeds`, and `serializeContentSeeds` in `src/utils/markdown.ts` with test coverage in `src/utils/markdown.test.ts`.
- **Implement MarkdownContentStore** -- Agent: codex -- Branch: `codex/phase3-content`. Added `src/core/content-store.ts` implementing `ContentStore` interface for ideas/drafts/seeds/chains and tests in `src/core/content-store.test.ts`.
- **Implement content CLI (list/add/status/pipeline)** -- Agent: codex -- Branch: `codex/phase3-content`. Added `src/cli/content.ts`, exported via `src/cli/index.ts`, and added `content` npm script in `package.json`.
- **Add /digest command to web terminal** -- Agent: codex -- Branch: `main`. Added `/digest` command path in `src/ui/handlers/chat.ts` and wired `runDailyDigest()` response with `modelUsed: "local:digest"`.
- **Hybrid mode for /gm command** -- Agent: codex -- Branch: `main`. Added `/gm <instruction>` hybrid flow in `src/ui/handlers/chat.ts`, routing briefing + user instruction through ConfigRouter and returning `modelUsed: "hybrid:gm+{model}"`.
- **Phase 2c: Implement MeetingPrepGenerator** -- Agent: codex -- Branch: `main`. Added `LLMMeetingPrepGenerator` in `src/core/meeting-prep.ts` with contact lookup, recent interactions, queue action item matching, prompt loading, LLM JSON parsing, and fallback behavior. Added tests in `src/core/meeting-prep.test.ts`.
- **Phase 2c: Create /prep CLI command** -- Agent: codex -- Branch: `main`. Added `src/cli/prep.ts`, wired export in `src/cli/index.ts`, and added npm script `prep` in `package.json`.
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
- **Implement LLMContentDraftGenerator** -- Agent: claude -- `src/core/content-draft-generator.ts` implementing `ContentDraftGenerator`. Uses `content_drafting` task type for ConfigRouter, loads thread-builder.md prompt, parses JSON response (posts[] for threads, full_text for singles).
- **Implement PodcastDistributionGenerator** -- Agent: claude -- `src/core/podcast-distribution.ts` implementing `PodcastDistributionGenerator`. Loads podcast-distribution.md prompt, generates youtube_description + company_tweet + personal_post from PodcastEpisode input.
- **Implement LLMContentSeedExtractor** -- Agent: claude -- `src/core/content-seed-extractor.ts` implementing `ContentSeedExtractor`. Loads content-extractor.md prompt, generates seed IDs, filters by confidence threshold.
- **Implement Granola URL scraper** -- Agent: claude -- `src/integrations/granola.ts`. Fetches Granola shareable link, extracts meeting transcript via HTML scraping.
- **Add draft/revise/podcast/extract/seeds/promote CLI subcommands** -- Agent: claude -- Extended `src/cli/content.ts` with all Phase 3b+3c subcommands: draft, revise, podcast (interactive), extract (file/Granola URL), seeds, promote. Podcast creates 3-idea chain.
- **Add content pipeline section to /gm** -- Agent: claude -- Added Content Pipeline section to `src/cli/gm.ts` showing idea counts by status and unprocessed seed count.


