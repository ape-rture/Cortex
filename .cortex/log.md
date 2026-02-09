# Cortex Activity Log

*Newest entries at top. Both agents append here when completing work.*

---

## 2026-02-09 codex -- phase 4 multi-project management

- Implemented project registry markdown utilities: `parseProjects` / `serializeProjects` in `src/utils/markdown.ts` with new tests in `src/utils/markdown.test.ts`.
- Added `MarkdownProjectStore` in `src/core/project-store.ts` with CRUD/find/filter operations for `projects/project-registry.md`.
- Added `SimpleProjectGit` in `src/core/project-git.ts` implementing status/fetch/pull/push across external repo paths, with main/master push safety guard requiring `--force-main`.
- Added `TemplateScaffolder` in `src/core/project-scaffolder.ts` to scaffold from `exports/llm-collab-playbook/template-root/`, replace `[PROJECT_NAME]`, `[OWNER_NAME]`, `[DATE]`, support optional git init, and optional registry add.
- Added new project CLI in `src/cli/project.ts` with subcommands: `list`, `add`, `remove`, `status`, `push`, `pull`, `scaffold`, `update`.
- Wired CLI exports/scripts in `src/cli/index.ts` and `package.json` (`npm run project`).
- Added tests: `src/core/project-store.test.ts`, `src/core/project-git.test.ts`.
- Tests run:
  - `npm run typecheck`
  - `node --import tsx --test src/utils/markdown.test.ts src/core/project-store.test.ts src/core/project-git.test.ts`
  - `npm run test:unit`
- Branch flow: implemented on `codex/project-mgmt`, merged to `main`, branch deleted.

## 2026-02-05 claude -- Content DB architecture research

### Research: Local vs Cloud Memory

Analyzed when local BM25/embeddings vs cloud DB+RAG makes sense:
- **Local wins**: <100K docs, single user, offline, privacy-critical
- **Cloud wins**: Multi-user, >100K docs, complex queries, real-time updates

**Cortex position**: Local-first for personal context (correct), cloud for shared Indexing Co content.

### Architecture Decision: Two-Domain Model

1. **Cortex Personal** → Local markdown + git (unchanged)
2. **Indexing Co Content** → Managed Postgres + pgvector (Supabase)

Integration via MCP Server (`@indexingco/content-mcp`):
- Cortex calls `content_search`, `content_upsert` as MCP tools
- Same DB serves Marketing Tool via REST API
- Ingestion pipelines (cron, webhooks) populate content

### Documents Created

- `research/13-content-db-architecture.md` — Full technical research
- `decisions/2026-02-05-content-db-integration.md` — Architecture decision
- `decisions/2026-02-05-content-db-implementation-plan.md` — Phased implementation plan

### Key Decisions

- **Service**: Supabase (native pgvector, auth, REST API, edge functions)
- **Schema**: Single `content_items` table with vector embeddings
- **Embedding**: text-embedding-3-small (OpenAI)
- **Access**: MCP for Cortex, REST for Marketing Tool, Edge Functions for ingestion

### Next Steps (Codex)

Phase 2 of implementation plan: Build `@indexingco/content-mcp` server with:
- content_search, content_get, content_upsert, content_list, content_similar tools
- Supabase client + OpenAI embeddings integration

---

## 2026-02-05 claude -- Multi-project management design + template generalization

### Phase 4: Project Management (design complete)

**Types created:**
- `src/core/types/project.ts` — Project, ProjectStore, ProjectGitStatus, ProjectGitOperations, ScaffoldConfig, ScaffoldResult, ProjectScaffolder interfaces
- Added exports to `src/core/types/index.ts`

**Template generalized:**
- Renamed `.cortex/` → `.collab/` in all template files under `exports/llm-collab-playbook/template-root/`
- Updated references in CONVENTIONS.md, CLAUDE.md, AGENTS.md to use `.collab/`
- Updated README.md with scaffolding instructions

**Registry created:**
- `projects/project-registry.md` — initial registry with Cortex as first entry

**Codex tasks added:**
- parseProjects/serializeProjects utilities
- MarkdownProjectStore implementation
- SimpleProjectGit implementation (cross-folder git ops)
- TemplateScaffolder implementation
- project CLI with list/add/remove/status/push/pull/scaffold/update subcommands
- Tests for store and git operations

### Design decisions:
- Registry format: markdown table (consistent with content-ideas)
- Cross-folder git: use `cwd` option pattern from git-monitor.ts
- Template folder: `.collab/` (generic) instead of `.cortex/` (Cortex-specific)
- Safety: refuse push to main without explicit flag

Plan at: `C:\Users\Dennis\.claude\plans\floofy-enchanting-tarjan.md`

## 2026-02-04 codex -- tests for content generators and granola integration

- Added unit tests:
  - `src/core/content-draft-generator.test.ts`
  - `src/core/podcast-distribution.test.ts`
  - `src/core/content-seed-extractor.test.ts`
  - `src/integrations/granola.test.ts`
- Reconciled `src/core/content-store.ts` to use shared chain helpers from `src/utils/markdown.ts` (`parseContentChains` / `serializeContentChains`) instead of duplicate local functions
- Validation:
  - `npm run typecheck` (passed)
  - `npm run test:unit` (37/37 passed)

## 2026-02-04 claude -- Phase 3b+3c implementation (draft generator, podcast, seed extractor, Granola, CLI)

### Files created:
- `src/core/content-draft-generator.ts` — `LLMContentDraftGenerator` implementing `ContentDraftGenerator`. Uses `content_drafting` task type for ConfigRouter, loads thread-builder.md prompt, handles both thread (posts[]) and single-post (full_text) formats, supports draft revision with feedback.
- `src/core/podcast-distribution.ts` — `LLMPodcastDistributionGenerator` implementing `PodcastDistributionGenerator`. Builds episode prompt from PodcastEpisode metadata, returns youtube_description + company_tweet + personal_post.
- `src/core/content-seed-extractor.ts` — `LLMContentSeedExtractor` implementing `ContentSeedExtractor`. Loads content-extractor.md prompt, filters by confidence threshold, generates seed IDs with `nextSeedId`.
- `src/integrations/granola.ts` — Granola URL scraper. `isGranolaUrl()` detects Granola links, `fetchGranolaTranscript()` extracts text from HTML (main/article/content div, strips scripts/styles/tags).

### Files modified:
- `src/cli/content.ts` — Added all Phase 3b+3c subcommands:
  - `draft <id>` — generates draft for an idea via thread-builder
  - `revise <id> "feedback"` — revises existing draft with feedback
  - `podcast` — interactive episode input, generates distribution pack, saves as 3-idea chain (YouTube desc + @indexingco tweet + @ape_rture post)
  - `extract <file-or-url>` — runs file or Granola URL through seed extractor
  - `seeds` — lists unprocessed seeds
  - `promote <seed-id>` — converts seed to content idea
  - Updated `run()` switch and `runContent()` export for web terminal
- `src/cli/gm.ts` — Added Content Pipeline section to /gm briefing (idea counts by status, unprocessed seed count)
- `.cortex/tasks.md` — Moved Phase 3b+3c+integration tasks to Done

### Validation:
- `npm run typecheck` — clean
- `npm test` — 26/26 passed
- All content subcommands wired in both CLI and web terminal

### Note:
Unit tests for the new generators (draft, podcast, seed extractor, granola) were specified in the task board as Codex tasks but I implemented the modules directly. The modules follow the same ConfigRouter pattern as MeetingPrepGenerator. Tests for these modules are a good follow-up task.

## 2026-02-04 codex -- phase 3a content pipeline foundation

- Added content markdown utilities in `src/utils/markdown.ts`:
  - `parseContentIdeas` / `serializeContentIdeas`
  - `parseContentDraft` / `serializeContentDraft`
  - `parseContentSeeds` / `serializeContentSeeds`
- Added `MarkdownContentStore` in `src/core/content-store.ts` implementing `ContentStore` for ideas, drafts, seeds, and chains
- Added content CLI in `src/cli/content.ts` with `list`, `add`, `status`, and `pipeline` subcommands
- Added npm script `"content": "node --import tsx src/cli/content.ts"` and CLI export in `src/cli/index.ts`
- Added tests:
  - `src/core/content-store.test.ts`
  - extended `src/utils/markdown.test.ts` for content parsers/serializers
- Validation:
  - `npm run typecheck` (passed)
  - `npm run test:unit` (26/26 passed)
  - `npm run content list` (passed)
  - `npm run content pipeline` (passed)

## 2026-02-04 claude -- Phase 3 content pipeline design + Takopi patterns

### Takopi Integration (completed earlier this session)
- Created `src/core/types/events.ts` — normalized event model (StartedEvent, ActionEvent, CompletedEvent)
- Extended `src/core/types/routing.ts` — agent auto-router types (AgentAffinity, AgentRouteConfig, AgentRouter)
- Extended `src/core/types/session.ts` — resume tokens for cross-interface continuity
- Extended `src/core/types/task-queue.ts` — ThreadScheduler for per-context serialization
- Updated `src/core/types/orchestrator.ts` — integrated events + agent routing
- Updated barrel exports in `src/core/types/index.ts`
- Updated `projects/feature-roadmap.md` with Phase 5/7/8 additions
- Updated `context/model-routing-spec.md` with agent routing schema
- Created `decisions/2026-02-04-takopi-patterns.md`

### Phase 3 Content Pipeline (designed this session)

**Files created:**
- `src/core/types/content.ts` — all content pipeline types: ContentIdea, ContentSeed, ContentDraft, ContentChain, PodcastEpisode, PodcastDistributionPack, plus Store/Generator/Extractor interfaces
- `src/agents/prompts/thread-builder.md` — thread/post drafting prompt with Dennis's voice profile, platform rules, anti-patterns, examples
- `src/agents/prompts/podcast-distribution.md` — Block by Block distribution pack prompt (YouTube desc + @indexingco tweet + @ape_rture longform). Absorbs `block-by-block-distribution.md` into Cortex agent system
- `src/agents/prompts/content-extractor.md` — seed extraction prompt with confidence scoring, privacy rules, examples

**Files modified:**
- `src/core/types/index.ts` — added barrel exports for all content types
- `projects/content-ideas.md` — upgraded table format (added ID and Source columns)
- `projects/feature-roadmap.md` — Phase 3 now has sub-phases (3a/3b/3c/3d) with status tracking
- `.cortex/tasks.md` — added 10 Codex tasks across Phase 3a/3b/3c + integration

**Files created (templates):**
- `projects/content-seeds.md` — seed tracking (unprocessed/promoted)
- `projects/content-chains.md` — cross-platform recycling tracker
- `projects/content-drafts/.gitkeep` — draft storage directory

### For Codex (Phase 3a first):
1. Content markdown utilities in `src/utils/markdown.ts`
2. `MarkdownContentStore` in `src/core/content-store.ts`
3. Content CLI in `src/cli/content.ts` (list/add/status/pipeline)

Then Phase 3b (draft generator + podcast distribution) and 3c (seed extractor + Granola scraper).

All types are at `src/core/types/content.ts`. All prompts are in `src/agents/prompts/`.

## 2026-02-04 codex -- /digest + hybrid /gm + meeting prep

- Added `/digest` command handling and local response path in `src/ui/handlers/chat.ts`
- Added hybrid `/gm <instruction>` routing through ConfigRouter with `hybrid:gm+{model}` model tag in `src/ui/handlers/chat.ts`
- Added `LLMMeetingPrepGenerator` in `src/core/meeting-prep.ts` with prompt loading, contact lookup, open action item matching, LLM JSON parsing, and fallback behavior
- Added `/prep` CLI in `src/cli/prep.ts`, exported from `src/cli/index.ts`, and added npm script `prep` in `package.json`
- Added unit tests in `src/core/meeting-prep.test.ts`
- Follow-up stabilization: fixed repo-wide typecheck issues in `src/core/routing.ts`, `src/core/task-queue.test.ts`, `src/ui/index.ts`, `src/ui/store.ts`, `src/ui/utils.ts`, and `src/utils/markdown.ts`
- Tests: `npm run typecheck` (passed), `npm run test:unit` (18/18 passed), `npm run prep "Arjun"` (passed)

## 2026-02-03 claude -- Phase 2c meeting prep design

- Added `MeetingPrepGenerator` interface and `MeetingPrepConfig` to `src/core/types/crm.ts`
- Created `src/agents/prompts/meeting-prep.md` with LLM prompt for generating talking points
- Added two Codex tasks for implementation:
  1. `MeetingPrepGenerator` in `src/core/meeting-prep.ts`
  2. `/prep` CLI command in `src/cli/prep.ts`

### Key design decisions:
- Generator takes ContactStore, TaskQueue, and ConfigRouter as dependencies
- Searches task queue for open action items mentioning contact name/company
- LLM generates 3-5 talking points + context summary
- Output format: JSON with `talking_points[]` and `context_summary`

### For Codex:
- Interface at `src/core/types/crm.ts:MeetingPrepGenerator`
- Prompt at `src/agents/prompts/meeting-prep.md`
- Follow pattern from `src/cli/gm.ts` for CLI structure
- Add npm script `prep` to package.json

## 2026-02-03 codex -- Phase 2b decay detector

- Added SimpleDecayDetector to flag stale relationships
- /gm now shows Relationship Alerts section
- Added unit tests for decay detector
- Tests: npm run test:unit (15/15 passed)

## 2026-02-03 codex -- Phase 2a contact parser + store

- Enhanced parseContactFile to support CRM template + serializeContact
- Added MarkdownContactStore with CRUD/search + interaction updates
- Added unit tests for parser and contact store
- Tests: npm run test:unit (14/14 passed)

## 2026-02-03 codex -- web terminal backend

- Added Hono server + in-memory session store
- Implemented session CRUD + chat SSE endpoints wired to ConfigRouter
- Added UI server entrypoint + dev script
- Tests: npm run test:unit (13/13 passed)

## 2026-02-03 claude -- Phase 2 planning + CRM types

- Planned Phase 2: Relationships & Sales (local-only first, Attio deferred)
- Created `src/core/types/crm.ts` with Contact, InteractionRecord, DecayAlert, MeetingPrepBrief types
- Created `contacts/arjun-mukherjee.md` as test contact (lastContact: 2025-12-15 = 50+ days ago)
- Added Codex tasks for: contact parser enhancement, ContactStore, decay detector
- Updated feature roadmap with Phase 2 status

### Key design decisions:
- Local markdown files are source of truth
- Attio sync deferred until local features work
- 30-day threshold for decay alerts
- Monitor customer + lead contact types

### For Codex:
- Enhance `parseContactFile` in `src/utils/markdown.ts` to handle full template
- Implement `ContactStore` in `src/utils/contact-store.ts`
- Implement `DecayDetector` in `src/core/decay-detector.ts`
- Add "Relationship Alerts" section to /gm

## 2026-02-03 codex -- alias store + detector

- Added MarkdownAliasStore (context/aliases.md parser + expansion + save)
- Added SimpleAliasPatternDetector (phrase tracking + suggestion generation)
- Added unit tests for alias store and detector
- Tests: npm run test:unit (13/13 passed)

## 2026-02-03 claude -- web terminal MVP design + frontend

- Planned MVP browser chat interface (Hono + Preact + SSE)
- Created `src/ui/types.ts` with session and message types
- Created `src/ui/static/index.html` with full Preact SPA (no build step, CDN imports)
- Created `src/ui/static/style.css` with dark theme
- Added Phase 1.5 to feature roadmap
- Added Codex tasks for server foundation and API endpoints

### Stack choices:
- Hono (ESM-native, tiny, TypeScript-first)
- Preact + htm from CDN (no bundler)
- SSE for response streaming
- In-memory session store

### For Codex:
- Add hono deps, create `src/ui/server.ts` and `src/ui/store.ts`
- Implement session CRUD and chat handlers
- Wire ConfigRouter for LLM calls
- See plan at `.claude/plans/resilient-orbiting-stroustrup.md`

## 2026-02-03 codex -- merge git monitor + gm snapshot

- Merged branch `codex/git-monitor` into `main`
- /gm now includes Git status and session snapshot sections
- Tests: npm run test:unit (10/10 passed)

## 2026-02-03 claude -- shorthand/alias system design

- Designed alias file format in `context/aliases.md` (active, suggested, categories, rules)
- Created `src/core/types/alias.ts` with full type definitions (Alias, AliasSuggestion, AliasStore, AliasPatternDetector)
- Created `src/agents/prompts/alias-suggester.md` for background pattern analysis
- Added Codex task for implementation

### Key design decisions:
- Aliases have 5 categories: command, entity, phrase, path, status
- Pattern detection: 3+ words, 3+ occurrences in 7 days
- Suggestions go to "Suggested Aliases" section, user approves before activation
- Alias expansion works at input (user typing) and output (token reduction)

### For Codex:
- Types are in `src/core/types/alias.ts`
- Implement `AliasStore` (parse/serialize aliases.md) and `AliasPatternDetector`
- Detection prompt at `src/agents/prompts/alias-suggester.md`

## 2026-02-03 codex -- git monitor

- Added src/core/git-monitor.ts (SimpleGitMonitor)
- Added src/core/git-monitor.test.ts
- Integrated git section into /gm

## 2026-02-03 codex -- daily digest generator

- Added src/core/daily-digest.ts (MarkdownDigestGenerator + git/log/queue/pending aggregation)
- Added src/cli/digest.ts and npm script `digest`
- Added src/core/daily-digest.test.ts
- Tests: npm run test:unit (9/9 passed)

## 2026-02-02 codex -- session snapshot store

- Added src/core/session-snapshot.ts with markdown-backed store
- Added src/core/session-snapshot.test.ts
## 2026-02-02 codex -- cleanup bom in source

- Removed UTF-8 BOM markers from core source files to avoid import issues

## 2026-02-02 codex -- multi-calendar support

- Added multi-calendar support via GOOGLE_CALENDAR_IDS and calendarIds option
- /gm now shows calendar sources
- Added google-calendar unit test and updated knowledge base for calendar accounts
- Tests: npm run test:unit (7/7 passed)

## 2026-02-02 codex -- merge to main

- Merged branch `codex/core-tests` into `main` with --no-ff
- Ran `npm run test:unit` (6 tests passed)
- Ready to delete `codex/core-tests`

## 2026-02-02 codex -- apply stashed instructions

- Applied stashed updates to CONVENTIONS.md (new agent onboarding rules)
- Applied redaction flow section to context/model-routing.md
- Synced tasks board updates from stash

## 2026-02-02 codex -- test runner fix

- Updated npm scripts to use `node --import tsx` (Node 24 requirement)
- Installed deps and ran `npm run test:unit` successfully

## 2026-02-02 codex -- core tests

- Added node:test suites for markdown utils, task queue, routing
- Added npm script test:unit
- Tests failed locally: tsx loader missing (install deps first)

## 2026-02-02 codex -- gm entrypoint

- Added src/cli/gm.ts runnable morning briefing entrypoint
- Added src/cli/index.ts export and npm script \"gm\"
- Test run failed: tsx loader missing (install deps before running)

## 2026-02-02 codex -- google calendar integration

- Added src/integrations/google-calendar.ts (fetch today's events via googleapis)
- Added src/integrations/index.ts export
- Added googleapis dependency to package.json

## 2026-02-02 codex -- routing layer

- Added src/core/routing.ts implementing ConfigRouter (config load, policy rules, fallback chain, provider calls)
- Logs model performance to context/model-performance.md via append helper
- Uses heuristic classifier as placeholder until local classifier is available
- Tests: not run (no test runner configured)

## 2026-02-02 claude -- Phase 1 contracts (types, routing API, task queue, /gm skill)

- Created `src/core/types/` directory with all Phase 1 type definitions:
  - `agent-output.ts` -- Finding, AgentOutput, SalienceWeights, ScoredFinding
  - `permission.ts` -- PermissionEnvelope, ApiPermission
  - `routing.ts` -- Router interface, RouteRequest/RouteResponse, RoutingConfig, TaskType, ModelRef
  - `task-queue.ts` -- Task, TaskQueue interface, TaskStatus, TaskPriority, TaskSource
  - `orchestrator.ts` -- Orchestrator interface, OrchestratorCycle, Trigger, AgentSpawnConfig
  - `index.ts` -- barrel export
- Created `src/agents/prompts/gm.md` -- /gm morning routine skill prompt
- Created 4 Codex tasks in `.cortex/tasks.md`:
  1. Scaffold TypeScript project (package.json, tsconfig, SDKs)
  2. Implement routing layer (Router interface against both provider SDKs)
  3. Implement markdown read/write utils
  4. Implement task queue processor
- Branch: `claude/phase1-contracts`

### For Codex:
- Start with `codex/project-scaffold` -- the types are in `src/core/types/`, implement against those interfaces
- Routing layer (`Router` in `routing.ts`) wraps `@anthropic-ai/sdk` and `openai` -- loads config from `context/model-routing.json`
- Task queue (`TaskQueue` in `task-queue.ts`) reads/writes `actions/queue.md` -- use markdown utils
- All types use `readonly` properties and ESM imports (`.js` extensions)

### For Dennis:
- Review types in `src/core/types/` -- these are the contracts everything builds on
- Codex tasks are queued and ready to go
- After Codex scaffolds the project, both agents can work in parallel

---

## 2026-02-02 codex -- task queue processor

- Added src/core/task-queue.ts implementing MarkdownTaskQueue with add/update/list/next
- Reads/writes actions/queue.md using markdown utils

## 2026-02-02 codex -- markdown utils

- Added src/utils/markdown.ts with task queue parsing/serialization and contact parsing
- Added src/utils/index.ts exports

## 2026-02-02 codex -- scaffold TypeScript project

- Added package.json (ESM, strict TypeScript) with Anthropic + OpenAI SDK deps
- Added tsconfig.json (strict, NodeNext, path aliases)
- Ensured src/ structure (integrations/utils placeholders)

## 2026-02-02 codex -- phase 5 content creator naming

- Replaced Content Scanner with Content Creator across decision, routing, roadmap, and SYSTEM diagram
- Noted scanner as a sub-step of Content Creator

## 2026-02-02 codex -- propagate high-level tag + align docs

- Added explicit high-level tag example in Dennett decision doc
- Updated SYSTEM diagram to reflect initial agents (Sales, Content, Triage)
- Updated feature-roadmap and model-routing to match hybrid salience and agent set

## 2026-02-02 codex -- triage invocation + importance signals

- Triage Agent runs after multi-agent cycles or explicit high-level tag
- Importance derived from explicit input first, inferred otherwise; no override of explicit priority

## 2026-02-02 codex -- update dennett decision per guidance

- Phase 5 runtime agents set to Sales Watcher + Content Scanner
- Triage Agent runs only on high-level tasks; uses Dennis importance as constraint; suggestions only
- Salience scoring updated to hybrid rules + small model in Phase 5-6

## 2026-02-02 codex -- dennsett architecture practicality tweaks

- Clarified orchestrator role as thin policy gate (deterministic, no semantic reasoning)
- Added practicality notes and triage agent guidance
- Updated decision doc to reference canonical routing config and local-only policy

## 2026-02-02 claude -- Dennett architecture mapping & orchestrator design

- Created `decisions/2026-02-02-dennett-architecture.md` -- maps all 8 Dennett design principles to concrete architecture decisions
- Documented two-level agent model: build-time (Claude Code + Codex) vs runtime (orchestrator + spawned agents)
- Designed orchestrator: dumb scheduler (no Cartesian Theater), spawns agents as subprocesses, collects structured JSON, salience scoring
- Defined 7 runtime agent types with permission envelopes and model routing
- Added Dennett Architecture section to SYSTEM.md (between Modularity and Self-Improvement)
- Updated feature-roadmap.md with orchestrator milestones in Phases 1, 5, 7, 8
- Updated model-routing.md with agent-level routing table, escalation rules, salience scorer routing
- Files changed: decisions/2026-02-02-dennett-architecture.md (new), SYSTEM.md, projects/feature-roadmap.md, context/model-routing.md, .cortex/log.md

### Key for next session:
- The Dennett decision doc is the philosophical foundation -- all future agent design references it
- Runtime agent output schema is defined (JSON with findings, memory_updates, errors)
- Permission envelope schema is defined (read/write/API scoping per agent)
- Salience scoring formula: urgency * relevance * novelty * actionability

## 2026-02-02 codex -- finalize model ids + routing validator

- Finalized provider model ids in context/model-routing.json (Anthropic + OpenAI)
- Added scripts/validate-routing-config.mjs and ran it successfully
- Tests: node scripts/validate-routing-config.mjs

## 2026-02-02 codex -- routing config + mojibake cleanup

- Added canonical routing config and spec (context/model-routing.json, context/model-routing-spec.md)
- Updated model-routing summary and local-only policy (context/model-routing.md)
- Added missing templates (actions/queue.md, context/*.md, projects/*.md)
- Normalized non-ASCII punctuation in instructions and docs; removed box-drawing from decisions/2026-02-02-build-vs-openclaw.md
- Added queued tasks for Claude in .cortex/tasks.md
- Tests: not run (docs-only)

## 2026-02-02 claude -- Initial system setup

- Created full Cortex system design (SYSTEM.md)
- Researched 18 sources on AI assistants, security, multi-agent architecture
- Created 11 research files in /research/
- Created context files (me.md, company.md, model-routing.md)
- Made 7 blocking architecture decisions (language, interface, deployment, routing, security, marketing tool, local models)
- Created feature roadmap (8 phases, ~35 features)
- Set up collaboration system (CONVENTIONS.md, CLAUDE.md, AGENTS.md, .cortex/)
- Initialized git repo

### Key decisions for Codex to know:
- Language: TypeScript / Node.js 22+
- Providers: Anthropic (Claude) + OpenAI (Codex) -- both first-class
- Interface: Slack `#cortex` channel (command input), Telegram (read-only data source)
- Deployment: Local primary + cheap VPS for Slack bot + Telegram listener
- Security: Layered by phase, human-in-the-loop for public actions
- See `decisions/2026-02-02-blocking-decisions.md` for full details

## 2026-02-03 codex -- wire /gm in UI

- Added UI chat command routing so gm/good morning runs the real morning briefing instead of LLM stub
- Files changed: src/ui/handlers/chat.ts
- Tests: not run (behavioral change in UI handler)
- Branch merged: codex/ui-gm


## 2026-02-04 codex -- web scraper module

- Implemented tiered web scraper module with browser escalation, robots caching, link extraction, and crawl limits.
- Added tests for web scraper tiering, readability, link extraction, and crawl behaviors (browser escalation gated by TEST_BROWSER).
- Files: src/integrations/web-scraper.ts, src/integrations/web-scraper.test.ts, src/integrations/index.ts, package.json, package-lock.json
- Tests: npm run typecheck, npm run test:unit

## 2026-02-05 codex -- web scraper housekeeping commit

- Committed web scraper type exports, research notes, and collaboration playbook export assets.
- Files: src/core/types/web-scraper.ts, src/core/types/index.ts, research/12-web-scraping-options.md, QUICKSTART.md, context/model-performance.md, .mcp.json, exports/llm-collab-playbook/*
- Tests: not run (docs/config export only)

## 2026-02-05 codex -- meeting prep scraping + scrape CLI

- Meeting prep now pulls company news via injected web scraper, surfaces in CLI output and LLM prompt (untrusted).
- Added `npm run scrape` CLI for one-off fetch or crawl runs.
- Granola transcript fetch now uses the tiered web scraper with HTML fallback extraction.
- Contact parser now supports `Website` in contact info.
- Files: src/core/meeting-prep.ts, src/core/meeting-prep.test.ts, src/cli/prep.ts, src/cli/scrape.ts, src/cli/index.ts, src/integrations/granola.ts, src/integrations/granola.test.ts, src/utils/markdown.ts, package.json
- Tests: node --import tsx --test src/core/meeting-prep.test.ts src/integrations/granola.test.ts src/utils/markdown.test.ts
