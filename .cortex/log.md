# Cortex Activity Log

*Newest entries at top. Both agents append here when completing work.*

---

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

