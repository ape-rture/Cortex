# Task Board

*Dennis assigns tasks here. Agents pick up their assigned work.*

---

## Queued

*Add tasks with `Agent: claude` or `Agent: codex` to assign.*

### Memory Flywheel (Phase 5.5)

### Orchestrator MVP Follow-up (Phase 5)

### Claude Code Agents (Phase 5.5)

### Web Terminal (Phase 1.5)

### Gmail Integration (Phase 6)

### Typed Capture System (Phase 8)

### FOCUS — Mail Enrichment

- **Add more mail functionality and enrichment to Focus** -- Project: `focus-lead-gen` (`D:\Documenten\Programmeren\Python\Cryptocurrency\The Indexing Company\FOCUS - Lead gen system`)

### Unified Capture Store (Phase 9)

Unify all 5 capture stores into a single `MarkdownTaskQueue`. A capture is just a task with a `capture_type` field. Plan: `C:\Users\Dennis\.claude\plans\velvety-twirling-toast.md`

- **Phase 1: Extend Task type and parser** -- Agent: codex -- Branch: `codex/unified-captures`. Add `CaptureType` + optional fields (`source_url`, `rationale`, `category`, `format`, `platform`) to Task interface in `src/core/types/task-queue.ts`. Extend `parseTaskQueue()`/`serializeTaskQueue()` in `src/utils/markdown.ts` for new fields. Delete 8 absorbed parse/serialize functions. Add `listByType()` to `MarkdownTaskQueue`. Trim `src/core/types/capture.ts` (remove `ResearchItem`, `FeatureProposal`, `ProjectSeed`). Delete `research-store.ts`, `feature-store.ts`, `idea-store.ts` + their tests. Update `task-queue.test.ts` and `markdown.test.ts`.

- **Phase 2: Update routing** -- Agent: codex -- Same branch. Rewrite `src/cli/capture.ts` `routeCapture()` to always go through `taskQueue.add()` with `capture_type`. Simplify `src/agents/telegram-triage.ts` — remove multi-store routing, single path: classify then `queue.add()`. Update `src/integrations/telegram/message-queue.ts` to set `capture_type` field. Rewrite `src/cli/capture.test.ts`.

- **Phase 3: Slim ContentStore** -- Agent: codex -- Same branch. Remove `loadIdeas()`/`saveIdeas()`/`addIdea()`/`updateIdeaStatus()`/`searchIdeas()`/`filterByStatus()`/`filterByPlatform()` from `src/core/content-store.ts`. Remove `ContentIdea` from `src/core/types/content.ts`. Update `src/cli/content.ts` idea commands to use TaskQueue. Update `src/cli/gm.ts` and `src/agents/content-scanner.ts`. Update `content-store.test.ts`.

- **Phase 4: Simplify captures handler and UI** -- Agent: claude -- Branch: `claude/unified-captures-handler`. Rewrite `src/ui/handlers/captures.ts` from 5-store aggregation to single `taskQueue.list()` + map. Remove `CaptureStores` interface. Update `src/ui/index.ts` (remove 4 store instantiations). Update `src/ui/dashboard/src/views/captures.tsx` `STATUS_COLUMNS` to unified `TaskStatus` values.

- **Phase 5: Cleanup** -- Agent: codex or claude. Delete empty data files (`actions/research-queue.md`, `projects/feature-proposals.md`, `projects/ideas.md`, `projects/content-ideas.md`). Run full test suite. Update `SYSTEM.md`.

### Ralph Loop — Autonomous Dual-Agent Supervisor (Phase 10)

Supervisor loop that reads `.cortex/tasks.md`, picks the next task, routes to Claude (SDK) or Codex (CLI), waits for completion, and loops until done. Plan: `C:\Users\Dennis\.claude\plans\pure-jumping-elephant.md`

- **Codex CLI subprocess wrapper** -- Agent: codex -- Branch: `codex/ralph-codex-process`. Create `src/core/codex-process.ts` with `executeCodexCliAgent()`. Spawn `codex exec - --full-auto --json --ephemeral -C <dir>`, pipe prompt via stdin, parse JSONL events, capture final message. Tests in `src/core/codex-process.test.ts`.

- **Enhanced task board parser** -- Agent: codex -- Branch: `codex/ralph-board-parser`. Extend `src/ui/handlers/tasks.ts` with `BoardTask` (group, branch, description, lineNumber), `ParsedBoard`, `parseFullBoard()`, `moveTaskOnBoard()`, `findTaskByTitle()`. Enhanced regex to capture branch names. Tests in `src/ui/handlers/tasks.test.ts`.

- **Ralph agent prompts** -- Agent: claude -- Commit to main. Create `src/agents/prompts/ralph-claude-worker.md` and `src/agents/prompts/ralph-codex-worker.md`. System prompts for Claude/Codex when dispatched by Ralph — include coordination protocol (update active/log/tasks files), git workflow, completion criteria.

- **Core Ralph loop** -- Agent: codex -- Branch: `codex/ralph-loop`. Create `src/core/ralph-loop.ts` with `RalphLoop` class. Read board, pick task, route agent, verify completion, stuck detection, abort handling. Depends on codex-process + board-parser + prompts. Tests in `src/core/ralph-loop.test.ts`.

- **Ralph CLI entry point + wiring** -- Agent: claude -- Branch: `claude/ralph-cli`. Create `src/cli/ralph.ts` with arg parsing (--group, --agent, --task, --max-iterations, --dry-run), signal handling, console output. Wire into `package.json` and `src/cli/index.ts`.

- **Forward-compat type extension** -- Agent: codex -- Commit to main. Add `"codex_cli"` to `execution_type` union in `src/core/types/orchestrator.ts`.

*Completed (moved to Done).*

## In Progress

*Agent moves task here when starting.*

- **Unified Capture Store (Phase 9) - Phases 1-3** -- Agent: codex -- Branch: `codex/unified-captures-phase9`. In progress: unify captures into `MarkdownTaskQueue`, update routing, and slim `ContentStore`.
## Done

- **Codex CLI subprocess wrapper (follow-up hardening)** -- Agent: codex -- Branch: `codex/ralph-codex-process` (merged to `main`). Updated `src/core/codex-process.ts` to preserve JSONL parsing and now fall back to `agent_message` events when `--output-last-message` output is unavailable; added coverage in `src/core/codex-process.test.ts`. Validation: `node --import tsx --test src/core/codex-process.test.ts`, `npm run typecheck`.
- **Ralph Loop (Phase 10) — Codex core tasks** -- Agent: codex -- Branch: `codex/ralph-loop` (merged to `main`). Implemented `src/core/codex-process.ts` + `src/core/codex-process.test.ts` (Codex CLI subprocess wrapper with JSONL parsing/stdin prompt/timeout), extended `src/ui/handlers/tasks.ts` with `BoardTask`/`ParsedBoard`/`parseFullBoard`/`moveTaskOnBoard`/`findTaskByTitle` and added `src/ui/handlers/tasks.test.ts`, implemented `src/core/ralph-loop.ts` + `src/core/ralph-loop.test.ts`, and added forward-compat `execution_type: "codex_cli"` in `src/core/types/orchestrator.ts`. Validation: targeted Ralph tests passed, `npm run typecheck` passed, `npm run ralph -- --dry-run --agent=codex` passed; `npm run test:unit` still has unrelated pre-existing failures in `src/core/resume-token-store.test.ts`.
- **Typed Capture System (Phase 8)** -- Agent: codex -- Branch: `codex/typed-capture` (ready for merge). Implemented `MarkdownResearchStore`, `MarkdownFeatureStore`, and `MarkdownIdeaStore` with parse/serialize support in `src/utils/markdown.ts`; added tests in `src/core/research-store.test.ts`, `src/core/feature-store.test.ts`, `src/core/idea-store.test.ts`, plus parser tests in `src/utils/markdown.test.ts`. Added `/capture` command in `src/cli/capture.ts` (typed subcommands, `/capture list`, `/capture inbox`, auto-classification), wired into `src/core/command-registry.ts`, `src/cli/index.ts`, and `package.json`, with tests in `src/cli/capture.test.ts`. Updated Telegram capture typing in `src/integrations/telegram/message-queue.ts` and `src/integrations/telegram/message-queue.test.ts` for `#research/#feature/#seed/#task/#content/#action` tags. Updated `src/agents/telegram-triage.ts` to route `research`, `cortex_feature`, and `project_seed` directly to new stores and skip LLM classification when `capture_type:*` tag is present. Validation: targeted typed-capture tests passed and `npm run typecheck` passed; `npm run test:unit` still has unrelated pre-existing failures in `src/core/resume-token-store.test.ts`.
- **Telegram Bot Integration (Phase 7)** -- Agent: codex -- Branch: `codex/telegram-bot` (merged to `main`). Added Telegram transport in `src/integrations/telegram/` (client/config/auth, markdown->HTML formatter + trim, queue ingest/parser + worker, barrel + tests), shipped Telegram bot CLI entrypoint in `src/cli/telegram.ts` with allowlist middleware, `/orchestrate` streaming updates, shared command routing, capture queueing, voice reply guard, optional auto-worker (`TELEGRAM_QUEUE_AUTOPROCESS`, `TELEGRAM_QUEUE_POLL_MS`, `TELEGRAM_QUEUE_BATCH_SIZE`), and graceful shutdown; wired script/export/integration barrels (`package.json`, `src/cli/index.ts`, `src/integrations/index.ts`); updated queue admin + `/inbox` for Telegram source support in `src/core/queue-admin.ts` and `src/core/command-registry.ts` with expanded tests in `src/core/queue-admin.test.ts`. Validation: `npm run typecheck`, `npm run test:unit`.
- **P2 Step 5: Command/shortcut interception layer** -- Agent: codex -- Branch: `main`. Added explicit shortcut interception (`src/core/command-interceptor.ts`) for digest/queue/orchestrate shortcuts and integrated it before command routing in web chat streaming (`src/ui/handlers/chat.ts`), Slack bot handling (`src/cli/slack.ts`), and shared command resolution (`src/core/command-registry.ts`). Added tests in `src/core/command-interceptor.test.ts`.
- **P2 Step 4: Chat multi-tab sessions (max 3)** -- Agent: codex -- Branch: `main`. Reworked chat UI to use a tab bar with max 3 concurrent sessions (`src/ui/dashboard/src/views/chat.tsx`), added deterministic tab naming + default-session guarantee, and updated styling/responsive behavior (`src/ui/dashboard/src/dashboard.css`). Validation: `npm run typecheck`, `npm run build:dashboard`.
- **P3: Slack message queue (ingest + worker + retries)** -- Agent: codex -- Branch: `main`. Implemented Slack queue ingestion + metadata/dedupe (`src/integrations/slack/message-queue.ts`), queue worker processing with batch + explicit failure handling (`src/integrations/slack/queue-worker.ts`), Slack bot poller/response loop + worker config envs (`src/cli/slack.ts`), and queue admin commands for status/failed/retry (`src/core/queue-admin.ts`, wired in `src/core/command-registry.ts`). Added tests in `src/integrations/slack/message-queue.test.ts`, `src/integrations/slack/queue-worker.test.ts`, and `src/core/queue-admin.test.ts`; updated queue markdown parsing/serialization to preserve `Description` in `src/utils/markdown.ts` + tests.
- **Gmail Integration (Phase 6)** -- Agent: codex -- Branch: `codex/gmail-integration` (merged to `main`). Implemented `GoogleGmailClient` with multi-account Gmail support and full CRUD flows in `src/integrations/gmail.ts`, added mocked integration coverage in `src/integrations/gmail.test.ts`, shipped `/mail` CLI in `src/cli/mail.ts` (inbox/search/read/labels/unread), wired command + script exports (`src/core/command-registry.ts`, `src/cli/index.ts`, `package.json`), and added an Email section to `/gm` with per-account unread counts and top urgent subjects (`src/cli/gm.ts`, plus `src/integrations/index.ts` export).
- **Implement fact-extractor + memory-synthesizer agents and tests (Phase 5.5)** -- Agent: codex -- Branch: `codex/memory-flywheel` (merged to `main`). Added `src/agents/fact-extractor.ts` (recent file scan in `meetings/` + `daily/`, LLM extraction via `ConfigRouter.route()`, entity creation/appends via `EntityStore`) and `src/agents/memory-synthesizer.ts` (entity scan, stale detection, synthesis routing, supersession + summary writes). Added tests in `src/agents/fact-extractor.test.ts` and `src/agents/memory-synthesizer.test.ts`. Wired local registration in `src/cli/orchestrate.ts`, `src/cli/daemon.ts`, `src/cli/slack.ts`, and `src/ui/server.ts`.
- **Implement MarkdownEntityStore (Phase 5.5)** -- Agent: codex -- Branch: `codex/memory-flywheel` (merged to `main`). Added `MarkdownEntityStore` in `src/core/entity-store.ts` implementing full entity CRUD/scaffolding (`listEntities`, `loadSummary`, `loadFacts`, `loadActiveFacts`, `appendFacts`, `supersedeFacts`, `writeSummary`, `createEntity`) with template-based initialization from `entities/_template-summary.md` and `entities/_template-facts.json`. Added coverage in `src/core/entity-store.test.ts`.
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




