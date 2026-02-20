# Cortex Activity Log

*Newest entries at top. Both agents append here when completing work.*

---

## 2026-02-20 codex -- unified capture store phase 9 cleanup

- Completed Phase 5 cleanup on `main`.
- Deleted legacy capture files:
  - `projects/feature-proposals.md`
  - `projects/ideas.md`
  - `projects/content-ideas.md`
  - (`actions/research-queue.md` was already absent)
- Updated `SYSTEM.md` to point to queue-backed capture storage:
  - ideas backlog -> `/actions/queue.md` with `capture_type: seed`
  - content ideas -> `/actions/queue.md` with `capture_type: content`
  - feature proposals -> `/actions/queue.md` with `capture_type: feature`
- Validation:
  - `npm test` passed
  - `npm run typecheck` passed
  - `npm run test:unit` still has pre-existing unrelated failures in `src/core/resume-token-store.test.ts`

## 2026-02-20 codex -- Ralph Loop (Phase 10) core implementation

### What
- Implemented Codex subprocess execution wrapper in `src/core/codex-process.ts` with stdin prompt piping, `codex exec ... --json` JSONL parsing, timeout kill handling, and output-last-message capture.
- Extended task board parsing/manipulation in `src/ui/handlers/tasks.ts` with:
  - `BoardTask`, `ParsedBoard`
  - `parseFullBoard()`
  - `findTaskByTitle()`
  - `moveTaskOnBoard()`
- Implemented Ralph supervisor loop core in `src/core/ralph-loop.ts`:
  - queue filtering by group/agent/title
  - queued -> in_progress transitions
  - Claude/Codex dispatch paths
  - completion verification via board re-read
  - retry + stuck detection and abort handling
- Added forward-compat orchestrator execution type `"codex_cli"` in `src/core/types/orchestrator.ts`.
- Added optional `task_prompt` override support in `src/core/claude-code-process.ts` for Ralph-directed Claude worker prompting.

### Files Changed
- `src/core/codex-process.ts`
- `src/core/codex-process.test.ts`
- `src/ui/handlers/tasks.ts`
- `src/ui/handlers/tasks.test.ts`
- `src/core/ralph-loop.ts`
- `src/core/ralph-loop.test.ts`
- `src/core/types/orchestrator.ts`
- `src/core/claude-code-process.ts`

### Validation
- `node --import tsx --test src/core/codex-process.test.ts src/ui/handlers/tasks.test.ts src/core/ralph-loop.test.ts src/core/claude-code-process.test.ts` -- passed
- `npm run typecheck` -- passed
- `npm run ralph -- --dry-run --agent=codex` -- passed
- `npm run test:unit` -- still has unrelated pre-existing failures in `src/core/resume-token-store.test.ts`

### Status
- Branch `codex/ralph-loop` merged to `main`.
- Ready for Claude/Dennis review of end-to-end Ralph execution behavior.

## 2026-02-19 claude -- Phase 10: Ralph Loop planning + scaffolding

### What
Designed and scaffolded the Ralph Loop — an autonomous dual-agent supervisor that reads `.cortex/tasks.md`, picks the next task, routes to Claude (SDK) or Codex (CLI subprocess), verifies completion, and loops until all tasks are done. Inspired by the Ralph loop pattern (github.com/snarktank/ralph).

### Files Created
- `src/agents/prompts/ralph-claude-worker.md` — system prompt for Claude when dispatched by Ralph
- `src/agents/prompts/ralph-codex-worker.md` — preamble template for Codex CLI prompt
- `src/cli/ralph.ts` — CLI entry point with arg parsing, event formatting, dry-run mode, signal handling
- `src/cli/index.ts` — added ralph export
- `package.json` — added `npm run ralph` script

### For Codex
4 tasks added to `.cortex/tasks.md` under "Ralph Loop (Phase 10)":
1. **Codex CLI subprocess wrapper** — `src/core/codex-process.ts` (spawn `codex exec` via stdin piping)
2. **Enhanced task board parser** — extend `src/ui/handlers/tasks.ts` with `BoardTask`, `ParsedBoard`, `moveTaskOnBoard()`
3. **Core Ralph loop** — `src/core/ralph-loop.ts` with `RalphLoop` class (depends on 1 + 2)
4. **Type extension** — add `"codex_cli"` to execution_type union

Full plan: `C:\Users\Dennis\.claude\plans\pure-jumping-elephant.md`

### Status
CLI and prompts are done. Core loop and codex-process need to be built by Codex before Ralph is functional.

---

## 2026-02-19 claude -- Unified Capture Store (Phase 9) planning

### Problem
Phase 8 created 5 separate stores (research, feature, idea, content ideas, task queue) with separate types, parsers, store classes, and markdown files. This is over-engineered -- a capture is just a task with a type label.

### Decision
Merge all capture stores into a single `MarkdownTaskQueue`. Add `capture_type` field to `Task` (task|research|content|feature|seed) plus optional type-specific fields. ContentStore keeps drafts/chains/seeds but loses idea management.

### Plan
`C:\Users\Dennis\.claude\plans\velvety-twirling-toast.md`

5 phases:
1. Extend Task type + parser, delete absorbed stores (codex)
2. Rewrite capture routing to single store (codex)
3. Slim ContentStore -- remove idea management (codex)
4. Simplify captures handler + dashboard UI (claude)
5. Delete empty data files, cleanup (either)

All 4 absorbed data files are empty -- no migration needed. Deletes 7 files, major changes to 10, minor to 6.

### Also
- Added task: "FOCUS -- Mail Enrichment" to task board
- Note: previous session committed to `codex/typed-capture` branch improperly (Claude commit `ad7233f` on Codex branch). Needs cleanup before Phase 9 starts.

---

## 2026-02-18 codex -- Typed Capture System (Phase 8) implementation

- Implemented typed capture stores:
  - `src/core/research-store.ts`
  - `src/core/feature-store.ts`
  - `src/core/idea-store.ts`
- Added capture markdown parsing/serialization:
  - `parseResearchQueue()` / `serializeResearchQueue()`
  - `parseFeatureProposals()` / `serializeFeatureProposals()`
  - `parseProjectSeeds()` / `serializeProjectSeeds()`
  - Files: `src/utils/markdown.ts`, `src/utils/markdown.test.ts`
- Added `/capture` CLI in `src/cli/capture.ts` with typed subcommands, `/capture list [type]`, `/capture inbox`, and untagged auto-classification via `ConfigRouter.route()`
- Wired `/capture` into `src/core/command-registry.ts`, `src/cli/index.ts`, and `package.json`; added tests in `src/cli/capture.test.ts`
- Updated Telegram typed capture flow:
  - prefix parsing for `#research`, `#feature`, `#seed`, `#task`, `#content`, `#action` in `src/integrations/telegram/message-queue.ts`
  - `capture_type:*` tagging + tests in `src/integrations/telegram/message-queue.test.ts`
  - triage routing additions (`research`, `cortex_feature`, `project_seed`) and tag-based LLM skip in `src/agents/telegram-triage.ts`
- Added store tests:
  - `src/core/research-store.test.ts`
  - `src/core/feature-store.test.ts`
  - `src/core/idea-store.test.ts`
- Included shared typed-capture contracts/prompts/scaffolding from handoff:
  - `src/core/types/capture.ts`
  - `src/agents/prompts/telegram-triage.md`
  - `actions/research-queue.md`
  - `projects/feature-proposals.md`
  - `projects/ideas.md`
- Validation:
  - `node --import tsx --test src/core/research-store.test.ts src/core/feature-store.test.ts src/core/idea-store.test.ts src/utils/markdown.test.ts src/integrations/telegram/message-queue.test.ts src/cli/capture.test.ts` passed
  - `npm run typecheck` passed
  - `npm run test:unit` has unrelated pre-existing failures in `src/core/resume-token-store.test.ts`

---

## 2026-02-18 claude -- Typed Capture System (Phase 8) â€” design + contracts

### Problem
Everything captured via Telegram/CLI lands in a flat `actions/queue.md` as undifferentiated tasks. Research links, project IDs, Cortex feature ideas, and new project seeds all look the same â€” making triage painful.

### Solution: typed capture with 3 entry points
- **Telegram** (async): capture â†’ queue â†’ triage agent classifies â†’ routes to typed store
- **CLI `/capture`** (interactive): parses optional type tag, writes directly or auto-classifies via LLM
- **Web terminal** (interactive): same as CLI via command registry

### 7 capture types with separate stores
| Type | Store |
|---|---|
| `research` | `actions/research-queue.md` |
| `content_idea` | `projects/content-ideas.md` (existing) |
| `project_task` | `.cortex/tasks.md` (existing) |
| `cortex_feature` | `projects/feature-proposals.md` |
| `project_seed` | `projects/ideas.md` |
| `action_item` | `actions/pending.md` (existing) |
| `needs_review` | stays in queue as blocked |

### What Claude did
- Designed types + interfaces: `src/core/types/capture.ts` (CaptureType, ResearchItem/Store, FeatureProposal/Store, ProjectSeed/IdeaStore)
- Expanded triage prompt: `src/agents/prompts/telegram-triage.md` (4 â†’ 7 categories with classification signals)
- Scaffolded store files: `actions/research-queue.md`, `projects/feature-proposals.md`, updated `projects/ideas.md`

### For Codex
6 tasks in `.cortex/tasks.md` under "Typed Capture System (Phase 8)". Branch: `codex/typed-capture`.
1. MarkdownResearchStore + parse/serialize + tests
2. MarkdownFeatureStore + parse/serialize + tests
3. MarkdownIdeaStore + parse/serialize + tests
4. `/capture` CLI command + command registry wiring + tests
5. Update telegram-triage agent routing for new categories
6. Add Telegram type prefix parsing (`#research`, `#feature`, etc.)

### Plan file
`C:\Users\Dennis\.claude\plans\serialized-chasing-naur.md`

---

## 2026-02-18 codex -- Typed Capture System (Phase 8) implementation

- Implemented typed capture stores:
  - `src/core/research-store.ts`
  - `src/core/feature-store.ts`
  - `src/core/idea-store.ts`
- Added capture markdown parsing/serialization:
  - `parseResearchQueue()` / `serializeResearchQueue()`
  - `parseFeatureProposals()` / `serializeFeatureProposals()`
  - `parseProjectSeeds()` / `serializeProjectSeeds()`
  - Files: `src/utils/markdown.ts`, `src/utils/markdown.test.ts`
- Added `/capture` CLI in `src/cli/capture.ts` with typed subcommands, `/capture list [type]`, `/capture inbox`, and untagged auto-classification via `ConfigRouter.route()`
- Wired `/capture` into `src/core/command-registry.ts`, `src/cli/index.ts`, and `package.json`; added tests in `src/cli/capture.test.ts`
- Updated Telegram typed capture flow:
  - prefix parsing for `#research`, `#feature`, `#seed`, `#task`, `#content`, `#action` in `src/integrations/telegram/message-queue.ts`
  - `capture_type:*` tagging + tests in `src/integrations/telegram/message-queue.test.ts`
  - triage routing additions (`research`, `cortex_feature`, `project_seed`) and tag-based LLM skip in `src/agents/telegram-triage.ts`
- Added store tests:
  - `src/core/research-store.test.ts`
  - `src/core/feature-store.test.ts`
  - `src/core/idea-store.test.ts`
- Included shared typed-capture contracts/prompts/scaffolding from handoff:
  - `src/core/types/capture.ts`
  - `src/agents/prompts/telegram-triage.md`
  - `actions/research-queue.md`
  - `projects/feature-proposals.md`
  - `projects/ideas.md`
- Validation:
  - `node --import tsx --test src/core/research-store.test.ts src/core/feature-store.test.ts src/core/idea-store.test.ts src/utils/markdown.test.ts src/integrations/telegram/message-queue.test.ts src/cli/capture.test.ts` passed
  - `npm run typecheck` passed
  - `npm run test:unit` has unrelated pre-existing failures in `src/core/resume-token-store.test.ts`

---
## 2026-02-16 claude -- Telegram bot integration (Phase 7) â€” design + contracts

### Switching personal capture from Slack DMs to Telegram

Dennis wants to use Telegram instead of Slack DMs for personal idea capture. Telegram has built-in voice-to-text, is separate from the Indexing Co workspace, and avoids context switching concerns.

**Shared contracts updated (on `main`):**
- `src/core/types/task-queue.ts` â€” added `"telegram"` to `TaskSource` union
- `src/utils/markdown.ts` â€” added `"telegram"` to `parseSource()` recognition
- `SYSTEM.md` â€” updated Telegram from "read-only data source" to "Personal capture channel"

**Architecture:** Mirrors Slack integration exactly. Telegram transport layer â†’ same shared core (MarkdownTaskQueue, resolveCommand, ConfigRouter). Uses Telegraf v4 with long polling (no public URL needed). User ID whitelist for auth.

**For Codex:** 4 tasks written to `.cortex/tasks.md` under "Telegram Bot Integration (Phase 7)". Branch: `codex/telegram-bot`. Tasks cover: integration module, CLI entrypoint, queue admin updates, tests.

**For Dennis (before Codex can test):**
1. Create bot via @BotFather â†’ get `TELEGRAM_BOT_TOKEN`
2. Get numeric user ID via @userinfobot â†’ set `TELEGRAM_ALLOWED_USER_IDS`
3. Add both to `.env`

**Plan file:** `C:\Users\Dennis\.claude\plans\optimized-roaming-penguin.md`

---

## 2026-02-18 codex -- Typed Capture System (Phase 8) implementation

- Implemented typed capture stores:
  - `src/core/research-store.ts`
  - `src/core/feature-store.ts`
  - `src/core/idea-store.ts`
- Added capture markdown parsing/serialization:
  - `parseResearchQueue()` / `serializeResearchQueue()`
  - `parseFeatureProposals()` / `serializeFeatureProposals()`
  - `parseProjectSeeds()` / `serializeProjectSeeds()`
  - Files: `src/utils/markdown.ts`, `src/utils/markdown.test.ts`
- Added `/capture` CLI in `src/cli/capture.ts` with typed subcommands, `/capture list [type]`, `/capture inbox`, and untagged auto-classification via `ConfigRouter.route()`
- Wired `/capture` into `src/core/command-registry.ts`, `src/cli/index.ts`, and `package.json`; added tests in `src/cli/capture.test.ts`
- Updated Telegram typed capture flow:
  - prefix parsing for `#research`, `#feature`, `#seed`, `#task`, `#content`, `#action` in `src/integrations/telegram/message-queue.ts`
  - `capture_type:*` tagging + tests in `src/integrations/telegram/message-queue.test.ts`
  - triage routing additions (`research`, `cortex_feature`, `project_seed`) and tag-based LLM skip in `src/agents/telegram-triage.ts`
- Added store tests:
  - `src/core/research-store.test.ts`
  - `src/core/feature-store.test.ts`
  - `src/core/idea-store.test.ts`
- Included shared typed-capture contracts/prompts/scaffolding from handoff:
  - `src/core/types/capture.ts`
  - `src/agents/prompts/telegram-triage.md`
  - `actions/research-queue.md`
  - `projects/feature-proposals.md`
  - `projects/ideas.md`
- Validation:
  - `node --import tsx --test src/core/research-store.test.ts src/core/feature-store.test.ts src/core/idea-store.test.ts src/utils/markdown.test.ts src/integrations/telegram/message-queue.test.ts src/cli/capture.test.ts` passed
  - `npm run typecheck` passed
  - `npm run test:unit` has unrelated pre-existing failures in `src/core/resume-token-store.test.ts`

---
## 2026-02-12 claude -- Workspaces: multi-project CLI terminal manager

### Built full-stack terminal management system (Phase 1-4)

Added a "Workspaces" view to the Cortex dashboard that spawns Claude CLI, Codex CLI, and shell terminals per project â€” all managed via the browser.

**Backend (6 new files):**
- `src/ui/terminal/types.ts` â€” shared types, WS protocol messages
- `src/ui/terminal/scrollback-buffer.ts` â€” 500KB ring buffer
- `src/ui/terminal/terminal-session-manager.ts` â€” node-pty (ConPTY) lifecycle, process tree cleanup, scrollback disk persistence
- `src/ui/terminal/ws-server.ts` â€” WebSocket server (`ws` library, noServer mode)
- `src/ui/terminal/workspace-config-store.ts` â€” persist layout to `context/workspaces.json`
- `src/ui/handlers/terminal.ts` â€” 9 REST endpoints (session CRUD, config, git info)

**Frontend (5 new files):**
- `src/ui/dashboard/src/views/workspaces.tsx` â€” main view with project tabs, auto-spawn, config persistence
- `src/ui/dashboard/src/components/terminal-pane.tsx` â€” xterm.js wrapper with FitAddon
- `src/ui/dashboard/src/components/project-tabs.tsx` â€” project tab bar with git commit subtitle
- `src/ui/dashboard/src/components/instance-tabs.tsx` â€” CLI sub-tabs with status dot, restart, close
- `src/ui/dashboard/src/hooks/use-websocket.ts` â€” WebSocket hook with exponential backoff reconnect

**Key behaviors:** auto-spawns Claude + Codex on project select, max 4 per project, restart button for exited processes, workspace config auto-saved, scrollback flushed every 30s, SIGINT cleanup.

**Dependencies added:** `ws`, `node-pty`, `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-webgl`, `@xterm/addon-canvas`

### Remaining (Phase 5)
- WebGL/canvas addon swapping for multiple visible terminals
- RSS memory monitoring display
- Full Cortex integration for project status overview

---

## 2026-02-18 codex -- Typed Capture System (Phase 8) implementation

- Implemented typed capture stores:
  - `src/core/research-store.ts`
  - `src/core/feature-store.ts`
  - `src/core/idea-store.ts`
- Added capture markdown parsing/serialization:
  - `parseResearchQueue()` / `serializeResearchQueue()`
  - `parseFeatureProposals()` / `serializeFeatureProposals()`
  - `parseProjectSeeds()` / `serializeProjectSeeds()`
  - Files: `src/utils/markdown.ts`, `src/utils/markdown.test.ts`
- Added `/capture` CLI in `src/cli/capture.ts` with typed subcommands, `/capture list [type]`, `/capture inbox`, and untagged auto-classification via `ConfigRouter.route()`
- Wired `/capture` into `src/core/command-registry.ts`, `src/cli/index.ts`, and `package.json`; added tests in `src/cli/capture.test.ts`
- Updated Telegram typed capture flow:
  - prefix parsing for `#research`, `#feature`, `#seed`, `#task`, `#content`, `#action` in `src/integrations/telegram/message-queue.ts`
  - `capture_type:*` tagging + tests in `src/integrations/telegram/message-queue.test.ts`
  - triage routing additions (`research`, `cortex_feature`, `project_seed`) and tag-based LLM skip in `src/agents/telegram-triage.ts`
- Added store tests:
  - `src/core/research-store.test.ts`
  - `src/core/feature-store.test.ts`
  - `src/core/idea-store.test.ts`
- Included shared typed-capture contracts/prompts/scaffolding from handoff:
  - `src/core/types/capture.ts`
  - `src/agents/prompts/telegram-triage.md`
  - `actions/research-queue.md`
  - `projects/feature-proposals.md`
  - `projects/ideas.md`
- Validation:
  - `node --import tsx --test src/core/research-store.test.ts src/core/feature-store.test.ts src/core/idea-store.test.ts src/utils/markdown.test.ts src/integrations/telegram/message-queue.test.ts src/cli/capture.test.ts` passed
  - `npm run typecheck` passed
  - `npm run test:unit` has unrelated pre-existing failures in `src/core/resume-token-store.test.ts`

---
## 2026-02-10 claude -- Gmail integration Phase 1 foundation

### Designed types, auth script, and Codex tasks for Gmail integration

Two Gmail accounts: `dennis@indexing.co` and `dennisverstappen1@gmail.com`. Access level: read + modify + create drafts (no send).

- **Types**: `src/core/types/gmail.ts` â€” GmailClient interface, GmailMessageHeader/GmailMessage, GmailSearchOptions, GmailFetchResult, GmailMailSummary, MailClassification (for Phase 3), GmailAction (for Phase 4)
- **Auth script**: `scripts/gmail-auth.ts` â€” interactive OAuth2 flow to generate refresh tokens per account. Uses same `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` as calendar. Scopes: `gmail.modify` + `gmail.compose`
- **Types barrel**: Updated `src/core/types/index.ts` with all Gmail type exports
- **Codex tasks**: 4 tasks written to `.cortex/tasks.md` under "Gmail Integration (Phase 6)":
  1. Implement `GoogleGmailClient` in `src/integrations/gmail.ts`
  2. Add Gmail integration tests
  3. Create `/mail` CLI command
  4. Add "Email" section to `/gm`

### Validation

- `npm run typecheck` â€” clean
- Branch: `claude/gmail-integration`

### For Dennis (before Codex can start)

1. Enable Gmail API in Google Cloud Console (same project as Calendar)
2. Run `npx tsx scripts/gmail-auth.ts` â€” authorize `dennis@indexing.co`, save token as `GMAIL_INDEXING_REFRESH_TOKEN`
3. Run again â€” authorize `dennisverstappen1@gmail.com`, save token as `GMAIL_PERSONAL_REFRESH_TOKEN`
4. Add both tokens to `.env`
5. Merge `claude/gmail-integration` to `main`

### For Codex

Pick up the 4 tasks in `.cortex/tasks.md` under "Gmail Integration (Phase 6)" on branch `codex/gmail-integration` (after merge). Types are at `src/core/types/gmail.ts`. Follow the google-calendar.ts pattern.

### Future phases (not yet tasked)

- Phase 3: Mail intelligence agent (LLM classifier for newsletters, event invites, LinkedIn notifications)
- Phase 4: Cleanup actions (bulk archive newsletters, event invite triage, FOCUS integration)
- Plan at: `C:\Users\Dennis\.claude\plans\async-painting-ullman.md`

---

## 2026-02-18 codex -- Typed Capture System (Phase 8) implementation

- Implemented typed capture stores:
  - `src/core/research-store.ts`
  - `src/core/feature-store.ts`
  - `src/core/idea-store.ts`
- Added capture markdown parsing/serialization:
  - `parseResearchQueue()` / `serializeResearchQueue()`
  - `parseFeatureProposals()` / `serializeFeatureProposals()`
  - `parseProjectSeeds()` / `serializeProjectSeeds()`
  - Files: `src/utils/markdown.ts`, `src/utils/markdown.test.ts`
- Added `/capture` CLI in `src/cli/capture.ts` with typed subcommands, `/capture list [type]`, `/capture inbox`, and untagged auto-classification via `ConfigRouter.route()`
- Wired `/capture` into `src/core/command-registry.ts`, `src/cli/index.ts`, and `package.json`; added tests in `src/cli/capture.test.ts`
- Updated Telegram typed capture flow:
  - prefix parsing for `#research`, `#feature`, `#seed`, `#task`, `#content`, `#action` in `src/integrations/telegram/message-queue.ts`
  - `capture_type:*` tagging + tests in `src/integrations/telegram/message-queue.test.ts`
  - triage routing additions (`research`, `cortex_feature`, `project_seed`) and tag-based LLM skip in `src/agents/telegram-triage.ts`
- Added store tests:
  - `src/core/research-store.test.ts`
  - `src/core/feature-store.test.ts`
  - `src/core/idea-store.test.ts`
- Included shared typed-capture contracts/prompts/scaffolding from handoff:
  - `src/core/types/capture.ts`
  - `src/agents/prompts/telegram-triage.md`
  - `actions/research-queue.md`
  - `projects/feature-proposals.md`
  - `projects/ideas.md`
- Validation:
  - `node --import tsx --test src/core/research-store.test.ts src/core/feature-store.test.ts src/core/idea-store.test.ts src/utils/markdown.test.ts src/integrations/telegram/message-queue.test.ts src/cli/capture.test.ts` passed
  - `npm run typecheck` passed
  - `npm run test:unit` has unrelated pre-existing failures in `src/core/resume-token-store.test.ts`

---
## 2026-02-10 codex -- implement memory flywheel runtime agents (Phase 5.5)

### Built fact extraction and weekly synthesis agents

- Added `src/agents/fact-extractor.ts`:
  - Scans `meetings/` and `daily/` for files modified in the last 24h
  - Loads `src/agents/prompts/fact-extractor.md` and routes extraction requests through `ConfigRouter`
  - Attempts `task_type: "fact_extraction"` first, then falls back to `classification` if route is missing
  - Parses JSON entity/fact output, creates entities, and appends `AtomicFact[]` via `MarkdownEntityStore`
  - Returns summarized `AgentOutput` findings with extraction counts
- Added `src/agents/memory-synthesizer.ts`:
  - Enumerates entities across all kinds via `EntityStore.listEntities()`
  - Detects entities needing updates based on facts newer than `summary.lastUpdated` (plus template summary detection)
  - Routes synthesis prompts via `ConfigRouter` (`research_analysis`)
  - Applies supersessions and writes refreshed summaries
  - Emits stale-entity findings and update-count findings
- Wired local agent registration in runtime entrypoints:
  - `src/cli/orchestrate.ts`
  - `src/cli/daemon.ts`
  - `src/cli/slack.ts`
  - `src/ui/server.ts`

### Tests

- Added `src/agents/fact-extractor.test.ts`:
  - Mocks router responses
  - Verifies extraction parsing, entity creation, fact append behavior
  - Verifies fallback path when `fact_extraction` route is unavailable
- Added `src/agents/memory-synthesizer.test.ts`:
  - Mocks `EntityStore` + router
  - Verifies summary rewrite, supersession application, stale-entity reporting

### Validation

- `npm run typecheck` -- clean
- `npm run test:unit` -- 102 passed, 1 skipped, 0 failed

### Branch flow

- Implemented on `codex/memory-flywheel`
- Merged to `main`
- Branch deleted

---

## 2026-02-18 codex -- Typed Capture System (Phase 8) implementation

- Implemented typed capture stores:
  - `src/core/research-store.ts`
  - `src/core/feature-store.ts`
  - `src/core/idea-store.ts`
- Added capture markdown parsing/serialization:
  - `parseResearchQueue()` / `serializeResearchQueue()`
  - `parseFeatureProposals()` / `serializeFeatureProposals()`
  - `parseProjectSeeds()` / `serializeProjectSeeds()`
  - Files: `src/utils/markdown.ts`, `src/utils/markdown.test.ts`
- Added `/capture` CLI in `src/cli/capture.ts` with typed subcommands, `/capture list [type]`, `/capture inbox`, and untagged auto-classification via `ConfigRouter.route()`
- Wired `/capture` into `src/core/command-registry.ts`, `src/cli/index.ts`, and `package.json`; added tests in `src/cli/capture.test.ts`
- Updated Telegram typed capture flow:
  - prefix parsing for `#research`, `#feature`, `#seed`, `#task`, `#content`, `#action` in `src/integrations/telegram/message-queue.ts`
  - `capture_type:*` tagging + tests in `src/integrations/telegram/message-queue.test.ts`
  - triage routing additions (`research`, `cortex_feature`, `project_seed`) and tag-based LLM skip in `src/agents/telegram-triage.ts`
- Added store tests:
  - `src/core/research-store.test.ts`
  - `src/core/feature-store.test.ts`
  - `src/core/idea-store.test.ts`
- Included shared typed-capture contracts/prompts/scaffolding from handoff:
  - `src/core/types/capture.ts`
  - `src/agents/prompts/telegram-triage.md`
  - `actions/research-queue.md`
  - `projects/feature-proposals.md`
  - `projects/ideas.md`
- Validation:
  - `node --import tsx --test src/core/research-store.test.ts src/core/feature-store.test.ts src/core/idea-store.test.ts src/utils/markdown.test.ts src/integrations/telegram/message-queue.test.ts src/cli/capture.test.ts` passed
  - `npm run typecheck` passed
  - `npm run test:unit` has unrelated pre-existing failures in `src/core/resume-token-store.test.ts`

---
## 2026-02-10 codex -- implement MarkdownEntityStore (Phase 5.5)

### Implemented file-backed knowledge graph entity store

- Added `src/core/entity-store.ts` with `MarkdownEntityStore` implementing `EntityStore` from `src/core/types/entity.ts`
- Implemented:
  - `listEntities()` directory scan by kind
  - `loadSummary()` front matter + markdown body parsing
  - `loadFacts()` / `loadActiveFacts()` from `facts.json`
  - `appendFacts()` with auto-create entity directory
  - `supersedeFacts()` status + supersededBy updates
  - `writeSummary()` summary front matter serialization
  - `createEntity()` template-based scaffolding from `entities/_template-summary.md` and `entities/_template-facts.json`
- Added tests in `src/core/entity-store.test.ts` covering create/load/list/append/active/supersede/write flows

### Validation

- `npm run typecheck` -- clean
- `npm run test:unit` -- 98 passed, 1 skipped, 0 failed

### Branch flow

- Implemented on `codex/memory-flywheel`
- Merged to `main`
- Branch deleted

---

## 2026-02-18 codex -- Typed Capture System (Phase 8) implementation

- Implemented typed capture stores:
  - `src/core/research-store.ts`
  - `src/core/feature-store.ts`
  - `src/core/idea-store.ts`
- Added capture markdown parsing/serialization:
  - `parseResearchQueue()` / `serializeResearchQueue()`
  - `parseFeatureProposals()` / `serializeFeatureProposals()`
  - `parseProjectSeeds()` / `serializeProjectSeeds()`
  - Files: `src/utils/markdown.ts`, `src/utils/markdown.test.ts`
- Added `/capture` CLI in `src/cli/capture.ts` with typed subcommands, `/capture list [type]`, `/capture inbox`, and untagged auto-classification via `ConfigRouter.route()`
- Wired `/capture` into `src/core/command-registry.ts`, `src/cli/index.ts`, and `package.json`; added tests in `src/cli/capture.test.ts`
- Updated Telegram typed capture flow:
  - prefix parsing for `#research`, `#feature`, `#seed`, `#task`, `#content`, `#action` in `src/integrations/telegram/message-queue.ts`
  - `capture_type:*` tagging + tests in `src/integrations/telegram/message-queue.test.ts`
  - triage routing additions (`research`, `cortex_feature`, `project_seed`) and tag-based LLM skip in `src/agents/telegram-triage.ts`
- Added store tests:
  - `src/core/research-store.test.ts`
  - `src/core/feature-store.test.ts`
  - `src/core/idea-store.test.ts`
- Included shared typed-capture contracts/prompts/scaffolding from handoff:
  - `src/core/types/capture.ts`
  - `src/agents/prompts/telegram-triage.md`
  - `actions/research-queue.md`
  - `projects/feature-proposals.md`
  - `projects/ideas.md`
- Validation:
  - `node --import tsx --test src/core/research-store.test.ts src/core/feature-store.test.ts src/core/idea-store.test.ts src/utils/markdown.test.ts src/integrations/telegram/message-queue.test.ts src/cli/capture.test.ts` passed
  - `npm run typecheck` passed
  - `npm run test:unit` has unrelated pre-existing failures in `src/core/resume-token-store.test.ts`

---
## 2026-02-10 codex -- complete Phase 5 routing/scheduling follow-up

### Implemented remaining Phase 5 backend pieces

- Added `ConfigAgentRouter` in `src/core/agent-router.ts` implementing cascade selection: user directive > context glob match > task affinity > default agent, with tests in `src/core/agent-router.test.ts`
- Added `InMemoryThreadScheduler` in `src/core/thread-scheduler.ts` wrapping `TaskQueue` with per-thread serialization and cross-thread parallel limits, with tests in `src/core/thread-scheduler.test.ts`
- Added `FileResumeTokenStore` in `src/core/resume-token-store.ts` with file-backed persistence (`context/resume-tokens.json`), token ID generation via `crypto.randomUUID`, and default 7-day pruning, with tests in `src/core/resume-token-store.test.ts`
- Wired AutoRouter into orchestrator in `src/core/orchestrator.ts`: when trigger omits `agents`, orchestrator resolves one via AgentRouter while preserving explicit-agent behavior
- Updated trigger typing to allow optional `agents` in `src/core/types/orchestrator.ts`
- Updated impacted tests in `src/core/orchestrator.test.ts`, `src/cli/orchestrate.ts`, and `src/ui/handlers/phase2-api.test.ts`

### Validation

- `npm run typecheck` -- clean
- `npm run test:unit` -- 93 passed, 1 skipped, 0 failed

### Branch flow

- Implemented on `codex/auto-router`
- Merged to `main`
- Branch deleted

---
## 2026-02-10 claude -- Merge claude/memory-flywheel to main

- Merged `claude/memory-flywheel` branch into `main` (no-ff merge)
- Typecheck clean, 80/80 tests pass (1 skipped)
- Codex can now pick up Phase 5.5 implementation tasks (MarkdownEntityStore, fact-extractor, memory-synthesizer)

---

## 2026-02-18 codex -- Typed Capture System (Phase 8) implementation

- Implemented typed capture stores:
  - `src/core/research-store.ts`
  - `src/core/feature-store.ts`
  - `src/core/idea-store.ts`
- Added capture markdown parsing/serialization:
  - `parseResearchQueue()` / `serializeResearchQueue()`
  - `parseFeatureProposals()` / `serializeFeatureProposals()`
  - `parseProjectSeeds()` / `serializeProjectSeeds()`
  - Files: `src/utils/markdown.ts`, `src/utils/markdown.test.ts`
- Added `/capture` CLI in `src/cli/capture.ts` with typed subcommands, `/capture list [type]`, `/capture inbox`, and untagged auto-classification via `ConfigRouter.route()`
- Wired `/capture` into `src/core/command-registry.ts`, `src/cli/index.ts`, and `package.json`; added tests in `src/cli/capture.test.ts`
- Updated Telegram typed capture flow:
  - prefix parsing for `#research`, `#feature`, `#seed`, `#task`, `#content`, `#action` in `src/integrations/telegram/message-queue.ts`
  - `capture_type:*` tagging + tests in `src/integrations/telegram/message-queue.test.ts`
  - triage routing additions (`research`, `cortex_feature`, `project_seed`) and tag-based LLM skip in `src/agents/telegram-triage.ts`
- Added store tests:
  - `src/core/research-store.test.ts`
  - `src/core/feature-store.test.ts`
  - `src/core/idea-store.test.ts`
- Included shared typed-capture contracts/prompts/scaffolding from handoff:
  - `src/core/types/capture.ts`
  - `src/agents/prompts/telegram-triage.md`
  - `actions/research-queue.md`
  - `projects/feature-proposals.md`
  - `projects/ideas.md`
- Validation:
  - `node --import tsx --test src/core/research-store.test.ts src/core/feature-store.test.ts src/core/idea-store.test.ts src/utils/markdown.test.ts src/integrations/telegram/message-queue.test.ts src/cli/capture.test.ts` passed
  - `npm run typecheck` passed
  - `npm run test:unit` has unrelated pre-existing failures in `src/core/resume-token-store.test.ts`

---
## 2026-02-10 claude -- Memory Flywheel types, prompts, and scaffolding (Phase 5.5)

### Designed knowledge graph layer for the Memory Flywheel

Created the foundational types, agent prompts, and directory structure for entity-based memory:

- **Types**: `src/core/types/entity.ts` (AtomicFact, EntitySummary, EntityStore, EntityKind, FactSupersession) + `src/core/types/decay.ts` (EntityDecayConfig, EntityDecayAlert, EntityDecayDetector)
- **Agent prompts**: `src/agents/prompts/fact-extractor.md` (real-time Haiku extraction, ~30min intervals) + `src/agents/prompts/memory-synthesizer.md` (weekly synthesis, summary rewriting, fact supersession)
- **Directory structure**: `entities/{people,companies,topics}/` with `_template-summary.md` and `_template-facts.json`
- **Orchestrator config**: Registered both agents in `context/orchestrator.json` with cron triggers (fact-extractor: */30min, synthesizer: Sundays 10am) and added to deep schedule
- **Types barrel**: Exported all new types from `src/core/types/index.ts`
- Typecheck clean, 76/76 tests pass
- Branch: `claude/memory-flywheel`
- Codex tasks written for: MarkdownEntityStore, fact-extractor agent, memory-synthesizer agent, tests

### Also in this session (prior to context compaction)

- **Slack bot (Phase 7)**: Built and committed on `claude/slack-bot`, merged to main
- **Codex tasks**: Wrote Phase 5 tasks (AutoRouter, ThreadScheduler, ResumeTokenStore)

---

## 2026-02-18 codex -- Typed Capture System (Phase 8) implementation

- Implemented typed capture stores:
  - `src/core/research-store.ts`
  - `src/core/feature-store.ts`
  - `src/core/idea-store.ts`
- Added capture markdown parsing/serialization:
  - `parseResearchQueue()` / `serializeResearchQueue()`
  - `parseFeatureProposals()` / `serializeFeatureProposals()`
  - `parseProjectSeeds()` / `serializeProjectSeeds()`
  - Files: `src/utils/markdown.ts`, `src/utils/markdown.test.ts`
- Added `/capture` CLI in `src/cli/capture.ts` with typed subcommands, `/capture list [type]`, `/capture inbox`, and untagged auto-classification via `ConfigRouter.route()`
- Wired `/capture` into `src/core/command-registry.ts`, `src/cli/index.ts`, and `package.json`; added tests in `src/cli/capture.test.ts`
- Updated Telegram typed capture flow:
  - prefix parsing for `#research`, `#feature`, `#seed`, `#task`, `#content`, `#action` in `src/integrations/telegram/message-queue.ts`
  - `capture_type:*` tagging + tests in `src/integrations/telegram/message-queue.test.ts`
  - triage routing additions (`research`, `cortex_feature`, `project_seed`) and tag-based LLM skip in `src/agents/telegram-triage.ts`
- Added store tests:
  - `src/core/research-store.test.ts`
  - `src/core/feature-store.test.ts`
  - `src/core/idea-store.test.ts`
- Included shared typed-capture contracts/prompts/scaffolding from handoff:
  - `src/core/types/capture.ts`
  - `src/agents/prompts/telegram-triage.md`
  - `actions/research-queue.md`
  - `projects/feature-proposals.md`
  - `projects/ideas.md`
- Validation:
  - `node --import tsx --test src/core/research-store.test.ts src/core/feature-store.test.ts src/core/idea-store.test.ts src/utils/markdown.test.ts src/integrations/telegram/message-queue.test.ts src/cli/capture.test.ts` passed
  - `npm run typecheck` passed
  - `npm run test:unit` has unrelated pre-existing failures in `src/core/resume-token-store.test.ts`

---
## 2026-02-10 codex -- complete Phase 5 routing/scheduling follow-up

### Implemented remaining Phase 5 backend pieces

- Added `ConfigAgentRouter` in `src/core/agent-router.ts` implementing cascade selection: user directive > context glob match > task affinity > default agent, with tests in `src/core/agent-router.test.ts`
- Added `InMemoryThreadScheduler` in `src/core/thread-scheduler.ts` wrapping `TaskQueue` with per-thread serialization and cross-thread parallel limits, with tests in `src/core/thread-scheduler.test.ts`
- Added `FileResumeTokenStore` in `src/core/resume-token-store.ts` with file-backed persistence (`context/resume-tokens.json`), token ID generation via `crypto.randomUUID`, and default 7-day pruning, with tests in `src/core/resume-token-store.test.ts`
- Wired AutoRouter into orchestrator in `src/core/orchestrator.ts`: when trigger omits `agents`, orchestrator resolves one via AgentRouter while preserving explicit-agent behavior
- Updated trigger typing to allow optional `agents` in `src/core/types/orchestrator.ts`
- Updated impacted tests in `src/core/orchestrator.test.ts`, `src/cli/orchestrate.ts`, and `src/ui/handlers/phase2-api.test.ts`

### Validation

- `npm run typecheck` -- clean
- `npm run test:unit` -- 93 passed, 1 skipped, 0 failed

### Branch flow

- Implemented on `codex/auto-router`
- Merged to `main`
- Branch deleted

---
## 2026-02-09 claude -- Merge claude/more-agents branch

### Finalized and merged orchestrator enhancements

- Enhanced `src/cli/orchestrate.ts` with `--trigger`, `--cron`, `--schedule` flags and config-driven agent picking
- Wired `/orchestrate` into web terminal (`src/ui/handlers/chat.ts`)
- Updated QUICKSTART docs, project registry (added Marketing Tool), task board
- Typecheck clean, 59/59 tests pass
- Branch: `claude/more-agents`, merged to `main`

---

## 2026-02-18 codex -- Typed Capture System (Phase 8) implementation

- Implemented typed capture stores:
  - `src/core/research-store.ts`
  - `src/core/feature-store.ts`
  - `src/core/idea-store.ts`
- Added capture markdown parsing/serialization:
  - `parseResearchQueue()` / `serializeResearchQueue()`
  - `parseFeatureProposals()` / `serializeFeatureProposals()`
  - `parseProjectSeeds()` / `serializeProjectSeeds()`
  - Files: `src/utils/markdown.ts`, `src/utils/markdown.test.ts`
- Added `/capture` CLI in `src/cli/capture.ts` with typed subcommands, `/capture list [type]`, `/capture inbox`, and untagged auto-classification via `ConfigRouter.route()`
- Wired `/capture` into `src/core/command-registry.ts`, `src/cli/index.ts`, and `package.json`; added tests in `src/cli/capture.test.ts`
- Updated Telegram typed capture flow:
  - prefix parsing for `#research`, `#feature`, `#seed`, `#task`, `#content`, `#action` in `src/integrations/telegram/message-queue.ts`
  - `capture_type:*` tagging + tests in `src/integrations/telegram/message-queue.test.ts`
  - triage routing additions (`research`, `cortex_feature`, `project_seed`) and tag-based LLM skip in `src/agents/telegram-triage.ts`
- Added store tests:
  - `src/core/research-store.test.ts`
  - `src/core/feature-store.test.ts`
  - `src/core/idea-store.test.ts`
- Included shared typed-capture contracts/prompts/scaffolding from handoff:
  - `src/core/types/capture.ts`
  - `src/agents/prompts/telegram-triage.md`
  - `actions/research-queue.md`
  - `projects/feature-proposals.md`
  - `projects/ideas.md`
- Validation:
  - `node --import tsx --test src/core/research-store.test.ts src/core/feature-store.test.ts src/core/idea-store.test.ts src/utils/markdown.test.ts src/integrations/telegram/message-queue.test.ts src/cli/capture.test.ts` passed
  - `npm run typecheck` passed
  - `npm run test:unit` has unrelated pre-existing failures in `src/core/resume-token-store.test.ts`

---
## 2026-02-10 codex -- complete Phase 5 routing/scheduling follow-up

### Implemented remaining Phase 5 backend pieces

- Added `ConfigAgentRouter` in `src/core/agent-router.ts` implementing cascade selection: user directive > context glob match > task affinity > default agent, with tests in `src/core/agent-router.test.ts`
- Added `InMemoryThreadScheduler` in `src/core/thread-scheduler.ts` wrapping `TaskQueue` with per-thread serialization and cross-thread parallel limits, with tests in `src/core/thread-scheduler.test.ts`
- Added `FileResumeTokenStore` in `src/core/resume-token-store.ts` with file-backed persistence (`context/resume-tokens.json`), token ID generation via `crypto.randomUUID`, and default 7-day pruning, with tests in `src/core/resume-token-store.test.ts`
- Wired AutoRouter into orchestrator in `src/core/orchestrator.ts`: when trigger omits `agents`, orchestrator resolves one via AgentRouter while preserving explicit-agent behavior
- Updated trigger typing to allow optional `agents` in `src/core/types/orchestrator.ts`
- Updated impacted tests in `src/core/orchestrator.test.ts`, `src/cli/orchestrate.ts`, and `src/ui/handlers/phase2-api.test.ts`

### Validation

- `npm run typecheck` -- clean
- `npm run test:unit` -- 93 passed, 1 skipped, 0 failed

### Branch flow

- Implemented on `codex/auto-router`
- Merged to `main`
- Branch deleted

---
## 2026-02-09 claude -- Claude Code Agent Execution (Phase 5.5)

### Added `claude_code` execution type to orchestrator

Agents can now run as full Claude Code sessions with autonomous reasoning capabilities. Each agent spawns an isolated SDK session via `@anthropic-ai/claude-agent-sdk` with scoped tools, structured JSON output (enforced via json_schema), and budget caps.

### Key decisions:
- **SDK over subprocess**: Started with CLI subprocess spawning, hit Windows arg escaping issues. Discovered `@anthropic-ai/claude-agent-sdk` package â€” programmatic API is much cleaner.
- **Structured output**: JSON schema enforcement via `outputFormat` ensures agents always return valid `{ findings, memory_updates, errors }`.
- **Budget caps**: Each agent limited to $0.50 per run via `maxBudgetUsd`.
- **Haiku for agents**: Sonnet was too slow for background agents. Haiku with 15 turns completes in ~3.5 min.
- **maxTurns matters**: With 5 turns, agents ran out of turns reading files and never produced output. 15 turns is the sweet spot.

### Files:
- `src/core/claude-code-process.ts` â€” SDK-based executor (query, parse, normalize)
- `src/agents/prompts/project-analyst.md` â€” first Claude Code agent
- Modified `src/core/agent-runner.ts` â€” claude_code routing, timeout handling
- Modified `src/core/types/orchestrator.ts` â€” new execution type, max_turns, allowed_tools

### Branch: `claude/claude-code-agents`

### Proof of concept:
`npm run orchestrate -- --agents=project-analyst --verbose` produces 9 structured findings analyzing the entire codebase. Cost: ~$0.14 per run.

### Unfinished:
- Need to merge branch to main
- Could add more claude_code agents (smart sales-watcher, triage agent)
- Could add parallel execution of local + claude_code agents (already works via Promise.allSettled)

---

## 2026-02-18 codex -- Typed Capture System (Phase 8) implementation

- Implemented typed capture stores:
  - `src/core/research-store.ts`
  - `src/core/feature-store.ts`
  - `src/core/idea-store.ts`
- Added capture markdown parsing/serialization:
  - `parseResearchQueue()` / `serializeResearchQueue()`
  - `parseFeatureProposals()` / `serializeFeatureProposals()`
  - `parseProjectSeeds()` / `serializeProjectSeeds()`
  - Files: `src/utils/markdown.ts`, `src/utils/markdown.test.ts`
- Added `/capture` CLI in `src/cli/capture.ts` with typed subcommands, `/capture list [type]`, `/capture inbox`, and untagged auto-classification via `ConfigRouter.route()`
- Wired `/capture` into `src/core/command-registry.ts`, `src/cli/index.ts`, and `package.json`; added tests in `src/cli/capture.test.ts`
- Updated Telegram typed capture flow:
  - prefix parsing for `#research`, `#feature`, `#seed`, `#task`, `#content`, `#action` in `src/integrations/telegram/message-queue.ts`
  - `capture_type:*` tagging + tests in `src/integrations/telegram/message-queue.test.ts`
  - triage routing additions (`research`, `cortex_feature`, `project_seed`) and tag-based LLM skip in `src/agents/telegram-triage.ts`
- Added store tests:
  - `src/core/research-store.test.ts`
  - `src/core/feature-store.test.ts`
  - `src/core/idea-store.test.ts`
- Included shared typed-capture contracts/prompts/scaffolding from handoff:
  - `src/core/types/capture.ts`
  - `src/agents/prompts/telegram-triage.md`
  - `actions/research-queue.md`
  - `projects/feature-proposals.md`
  - `projects/ideas.md`
- Validation:
  - `node --import tsx --test src/core/research-store.test.ts src/core/feature-store.test.ts src/core/idea-store.test.ts src/utils/markdown.test.ts src/integrations/telegram/message-queue.test.ts src/cli/capture.test.ts` passed
  - `npm run typecheck` passed
  - `npm run test:unit` has unrelated pre-existing failures in `src/core/resume-token-store.test.ts`

---
## 2026-02-10 codex -- complete Phase 5 routing/scheduling follow-up

### Implemented remaining Phase 5 backend pieces

- Added `ConfigAgentRouter` in `src/core/agent-router.ts` implementing cascade selection: user directive > context glob match > task affinity > default agent, with tests in `src/core/agent-router.test.ts`
- Added `InMemoryThreadScheduler` in `src/core/thread-scheduler.ts` wrapping `TaskQueue` with per-thread serialization and cross-thread parallel limits, with tests in `src/core/thread-scheduler.test.ts`
- Added `FileResumeTokenStore` in `src/core/resume-token-store.ts` with file-backed persistence (`context/resume-tokens.json`), token ID generation via `crypto.randomUUID`, and default 7-day pruning, with tests in `src/core/resume-token-store.test.ts`
- Wired AutoRouter into orchestrator in `src/core/orchestrator.ts`: when trigger omits `agents`, orchestrator resolves one via AgentRouter while preserving explicit-agent behavior
- Updated trigger typing to allow optional `agents` in `src/core/types/orchestrator.ts`
- Updated impacted tests in `src/core/orchestrator.test.ts`, `src/cli/orchestrate.ts`, and `src/ui/handlers/phase2-api.test.ts`

### Validation

- `npm run typecheck` -- clean
- `npm run test:unit` -- 93 passed, 1 skipped, 0 failed

### Branch flow

- Implemented on `codex/auto-router`
- Merged to `main`
- Branch deleted

---
## 2026-02-09 claude -- Orchestrator MVP (Phase 5)

### Implemented the Dennett-inspired orchestrator

Thin, non-intelligent scheduler that spawns agents in parallel, scores findings by salience, and surfaces only what passes the fame threshold. Zero LLM cost â€” all 3 agents are local TypeScript functions.

### Files created:
- `src/core/salience.ts` â€” `RuleBasedSalienceScorer` (weighted avg: urgency/relevance/novelty/actionability, hash-based novelty dedup)
- `src/core/permission-validator.ts` â€” `PermissionValidator` (glob-match memory updates against permission envelopes)
- `src/core/memory-writer.ts` â€” `MemoryWriter` (append/update/flag operations on markdown files)
- `src/core/agent-runner.ts` â€” `AgentRunner` (local_script execution, event emission, timeout enforcement)
- `src/core/orchestrator.ts` â€” `CortexOrchestrator` implementing `Orchestrator` interface (parallel execution, scoring, fame threshold filtering)
- `src/agents/sales-watcher.ts` â€” relationship decay via `SimpleDecayDetector`
- `src/agents/content-scanner.ts` â€” content pipeline health via `MarkdownContentStore`
- `src/agents/code-watcher.ts` â€” unpushed commits via `SimpleGitMonitor`
- `context/orchestrator.json` â€” agent definitions, permission envelopes, fame threshold config
- `src/cli/orchestrate.ts` â€” CLI entrypoint with `--agents`, `--verbose`, `--history` flags

### Files modified:
- `src/cli/index.ts` â€” added orchestrate export
- `package.json` â€” added `orchestrate` npm script

### Validation:
- `npm run typecheck` â€” clean
- `npm run test:unit` â€” 50/51 passed (1 skipped, 0 regressions)
- `npm run orchestrate` â€” runs 3 agents, surfaces 2 findings (decay alert + empty pipeline)
- Branch: `claude/orchestrator-mvp`, merged to `main`

### Key design decisions:
- **Local agents first** â€” zero LLM cost, fast, testable. LLM agents in next iteration
- **Weighted average** for salience (not product â€” product collapses too aggressively)
- **In-memory** cycle history (no file persistence for MVP)
- **Permission validation** before any memory writes

### For Codex:
1. Write unit tests for: salience, permission-validator, memory-writer, agent-runner, orchestrator
2. Wire `/orchestrate` command into web terminal (`src/ui/handlers/chat.ts`)
3. Add cron trigger support (`node-cron`, `src/core/cron-scheduler.ts`, `npm run daemon`)

---

## 2026-02-18 codex -- Typed Capture System (Phase 8) implementation

- Implemented typed capture stores:
  - `src/core/research-store.ts`
  - `src/core/feature-store.ts`
  - `src/core/idea-store.ts`
- Added capture markdown parsing/serialization:
  - `parseResearchQueue()` / `serializeResearchQueue()`
  - `parseFeatureProposals()` / `serializeFeatureProposals()`
  - `parseProjectSeeds()` / `serializeProjectSeeds()`
  - Files: `src/utils/markdown.ts`, `src/utils/markdown.test.ts`
- Added `/capture` CLI in `src/cli/capture.ts` with typed subcommands, `/capture list [type]`, `/capture inbox`, and untagged auto-classification via `ConfigRouter.route()`
- Wired `/capture` into `src/core/command-registry.ts`, `src/cli/index.ts`, and `package.json`; added tests in `src/cli/capture.test.ts`
- Updated Telegram typed capture flow:
  - prefix parsing for `#research`, `#feature`, `#seed`, `#task`, `#content`, `#action` in `src/integrations/telegram/message-queue.ts`
  - `capture_type:*` tagging + tests in `src/integrations/telegram/message-queue.test.ts`
  - triage routing additions (`research`, `cortex_feature`, `project_seed`) and tag-based LLM skip in `src/agents/telegram-triage.ts`
- Added store tests:
  - `src/core/research-store.test.ts`
  - `src/core/feature-store.test.ts`
  - `src/core/idea-store.test.ts`
- Included shared typed-capture contracts/prompts/scaffolding from handoff:
  - `src/core/types/capture.ts`
  - `src/agents/prompts/telegram-triage.md`
  - `actions/research-queue.md`
  - `projects/feature-proposals.md`
  - `projects/ideas.md`
- Validation:
  - `node --import tsx --test src/core/research-store.test.ts src/core/feature-store.test.ts src/core/idea-store.test.ts src/utils/markdown.test.ts src/integrations/telegram/message-queue.test.ts src/cli/capture.test.ts` passed
  - `npm run typecheck` passed
  - `npm run test:unit` has unrelated pre-existing failures in `src/core/resume-token-store.test.ts`

---
## 2026-02-10 codex -- complete Phase 5 routing/scheduling follow-up

### Implemented remaining Phase 5 backend pieces

- Added `ConfigAgentRouter` in `src/core/agent-router.ts` implementing cascade selection: user directive > context glob match > task affinity > default agent, with tests in `src/core/agent-router.test.ts`
- Added `InMemoryThreadScheduler` in `src/core/thread-scheduler.ts` wrapping `TaskQueue` with per-thread serialization and cross-thread parallel limits, with tests in `src/core/thread-scheduler.test.ts`
- Added `FileResumeTokenStore` in `src/core/resume-token-store.ts` with file-backed persistence (`context/resume-tokens.json`), token ID generation via `crypto.randomUUID`, and default 7-day pruning, with tests in `src/core/resume-token-store.test.ts`
- Wired AutoRouter into orchestrator in `src/core/orchestrator.ts`: when trigger omits `agents`, orchestrator resolves one via AgentRouter while preserving explicit-agent behavior
- Updated trigger typing to allow optional `agents` in `src/core/types/orchestrator.ts`
- Updated impacted tests in `src/core/orchestrator.test.ts`, `src/cli/orchestrate.ts`, and `src/ui/handlers/phase2-api.test.ts`

### Validation

- `npm run typecheck` -- clean
- `npm run test:unit` -- 93 passed, 1 skipped, 0 failed

### Branch flow

- Implemented on `codex/auto-router`
- Merged to `main`
- Branch deleted

---
## 2026-02-09 claude -- scaffold Marketing Tool project

- Scaffolded new project at `D:\Documenten\Programmeren\Marketing Tool` using `TemplateScaffolder`
- Created `.collab/` coordination files, `CONVENTIONS.md`, `CLAUDE.md`, `AGENTS.md`, `COMMANDS.md`
- Added `SYSTEM.md` with architecture overview, shared Supabase backend diagram, tech stack, and feature outline
- Added project-specific folders: `research/`, `decisions/`, `context/`
- Added `.gitignore` for Next.js/Node.js project
- Registered in project registry as `indexing-co-marketing-tool` (nextjs, typescript, supabase, tailwind)
- Created Cortex tracking file at `projects/marketing-tool.md`
- Git initialized with initial commit
- **Next**: Planning and research phase -- competitive analysis, MVP scope, UI wireframes, Next.js project setup

---

## 2026-02-18 codex -- Typed Capture System (Phase 8) implementation

- Implemented typed capture stores:
  - `src/core/research-store.ts`
  - `src/core/feature-store.ts`
  - `src/core/idea-store.ts`
- Added capture markdown parsing/serialization:
  - `parseResearchQueue()` / `serializeResearchQueue()`
  - `parseFeatureProposals()` / `serializeFeatureProposals()`
  - `parseProjectSeeds()` / `serializeProjectSeeds()`
  - Files: `src/utils/markdown.ts`, `src/utils/markdown.test.ts`
- Added `/capture` CLI in `src/cli/capture.ts` with typed subcommands, `/capture list [type]`, `/capture inbox`, and untagged auto-classification via `ConfigRouter.route()`
- Wired `/capture` into `src/core/command-registry.ts`, `src/cli/index.ts`, and `package.json`; added tests in `src/cli/capture.test.ts`
- Updated Telegram typed capture flow:
  - prefix parsing for `#research`, `#feature`, `#seed`, `#task`, `#content`, `#action` in `src/integrations/telegram/message-queue.ts`
  - `capture_type:*` tagging + tests in `src/integrations/telegram/message-queue.test.ts`
  - triage routing additions (`research`, `cortex_feature`, `project_seed`) and tag-based LLM skip in `src/agents/telegram-triage.ts`
- Added store tests:
  - `src/core/research-store.test.ts`
  - `src/core/feature-store.test.ts`
  - `src/core/idea-store.test.ts`
- Included shared typed-capture contracts/prompts/scaffolding from handoff:
  - `src/core/types/capture.ts`
  - `src/agents/prompts/telegram-triage.md`
  - `actions/research-queue.md`
  - `projects/feature-proposals.md`
  - `projects/ideas.md`
- Validation:
  - `node --import tsx --test src/core/research-store.test.ts src/core/feature-store.test.ts src/core/idea-store.test.ts src/utils/markdown.test.ts src/integrations/telegram/message-queue.test.ts src/cli/capture.test.ts` passed
  - `npm run typecheck` passed
  - `npm run test:unit` has unrelated pre-existing failures in `src/core/resume-token-store.test.ts`

---
## 2026-02-10 codex -- complete Phase 5 routing/scheduling follow-up

### Implemented remaining Phase 5 backend pieces

- Added `ConfigAgentRouter` in `src/core/agent-router.ts` implementing cascade selection: user directive > context glob match > task affinity > default agent, with tests in `src/core/agent-router.test.ts`
- Added `InMemoryThreadScheduler` in `src/core/thread-scheduler.ts` wrapping `TaskQueue` with per-thread serialization and cross-thread parallel limits, with tests in `src/core/thread-scheduler.test.ts`
- Added `FileResumeTokenStore` in `src/core/resume-token-store.ts` with file-backed persistence (`context/resume-tokens.json`), token ID generation via `crypto.randomUUID`, and default 7-day pruning, with tests in `src/core/resume-token-store.test.ts`
- Wired AutoRouter into orchestrator in `src/core/orchestrator.ts`: when trigger omits `agents`, orchestrator resolves one via AgentRouter while preserving explicit-agent behavior
- Updated trigger typing to allow optional `agents` in `src/core/types/orchestrator.ts`
- Updated impacted tests in `src/core/orchestrator.test.ts`, `src/cli/orchestrate.ts`, and `src/ui/handlers/phase2-api.test.ts`

### Validation

- `npm run typecheck` -- clean
- `npm run test:unit` -- 93 passed, 1 skipped, 0 failed

### Branch flow

- Implemented on `codex/auto-router`
- Merged to `main`
- Branch deleted

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

1. **Cortex Personal** â†’ Local markdown + git (unchanged)
2. **Indexing Co Content** â†’ Managed Postgres + pgvector (Supabase)

Integration via MCP Server (`@indexingco/content-mcp`):
- Cortex calls `content_search`, `content_upsert` as MCP tools
- Same DB serves Marketing Tool via REST API
- Ingestion pipelines (cron, webhooks) populate content

### Documents Created

- `research/13-content-db-architecture.md` â€” Full technical research
- `decisions/2026-02-05-content-db-integration.md` â€” Architecture decision
- `decisions/2026-02-05-content-db-implementation-plan.md` â€” Phased implementation plan

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

## 2026-02-18 codex -- Typed Capture System (Phase 8) implementation

- Implemented typed capture stores:
  - `src/core/research-store.ts`
  - `src/core/feature-store.ts`
  - `src/core/idea-store.ts`
- Added capture markdown parsing/serialization:
  - `parseResearchQueue()` / `serializeResearchQueue()`
  - `parseFeatureProposals()` / `serializeFeatureProposals()`
  - `parseProjectSeeds()` / `serializeProjectSeeds()`
  - Files: `src/utils/markdown.ts`, `src/utils/markdown.test.ts`
- Added `/capture` CLI in `src/cli/capture.ts` with typed subcommands, `/capture list [type]`, `/capture inbox`, and untagged auto-classification via `ConfigRouter.route()`
- Wired `/capture` into `src/core/command-registry.ts`, `src/cli/index.ts`, and `package.json`; added tests in `src/cli/capture.test.ts`
- Updated Telegram typed capture flow:
  - prefix parsing for `#research`, `#feature`, `#seed`, `#task`, `#content`, `#action` in `src/integrations/telegram/message-queue.ts`
  - `capture_type:*` tagging + tests in `src/integrations/telegram/message-queue.test.ts`
  - triage routing additions (`research`, `cortex_feature`, `project_seed`) and tag-based LLM skip in `src/agents/telegram-triage.ts`
- Added store tests:
  - `src/core/research-store.test.ts`
  - `src/core/feature-store.test.ts`
  - `src/core/idea-store.test.ts`
- Included shared typed-capture contracts/prompts/scaffolding from handoff:
  - `src/core/types/capture.ts`
  - `src/agents/prompts/telegram-triage.md`
  - `actions/research-queue.md`
  - `projects/feature-proposals.md`
  - `projects/ideas.md`
- Validation:
  - `node --import tsx --test src/core/research-store.test.ts src/core/feature-store.test.ts src/core/idea-store.test.ts src/utils/markdown.test.ts src/integrations/telegram/message-queue.test.ts src/cli/capture.test.ts` passed
  - `npm run typecheck` passed
  - `npm run test:unit` has unrelated pre-existing failures in `src/core/resume-token-store.test.ts`

---
## 2026-02-10 codex -- complete Phase 5 routing/scheduling follow-up

### Implemented remaining Phase 5 backend pieces

- Added `ConfigAgentRouter` in `src/core/agent-router.ts` implementing cascade selection: user directive > context glob match > task affinity > default agent, with tests in `src/core/agent-router.test.ts`
- Added `InMemoryThreadScheduler` in `src/core/thread-scheduler.ts` wrapping `TaskQueue` with per-thread serialization and cross-thread parallel limits, with tests in `src/core/thread-scheduler.test.ts`
- Added `FileResumeTokenStore` in `src/core/resume-token-store.ts` with file-backed persistence (`context/resume-tokens.json`), token ID generation via `crypto.randomUUID`, and default 7-day pruning, with tests in `src/core/resume-token-store.test.ts`
- Wired AutoRouter into orchestrator in `src/core/orchestrator.ts`: when trigger omits `agents`, orchestrator resolves one via AgentRouter while preserving explicit-agent behavior
- Updated trigger typing to allow optional `agents` in `src/core/types/orchestrator.ts`
- Updated impacted tests in `src/core/orchestrator.test.ts`, `src/cli/orchestrate.ts`, and `src/ui/handlers/phase2-api.test.ts`

### Validation

- `npm run typecheck` -- clean
- `npm run test:unit` -- 93 passed, 1 skipped, 0 failed

### Branch flow

- Implemented on `codex/auto-router`
- Merged to `main`
- Branch deleted

---
## 2026-02-05 claude -- Multi-project management design + template generalization

### Phase 4: Project Management (design complete)

**Types created:**
- `src/core/types/project.ts` â€” Project, ProjectStore, ProjectGitStatus, ProjectGitOperations, ScaffoldConfig, ScaffoldResult, ProjectScaffolder interfaces
- Added exports to `src/core/types/index.ts`

**Template generalized:**
- Renamed `.cortex/` â†’ `.collab/` in all template files under `exports/llm-collab-playbook/template-root/`
- Updated references in CONVENTIONS.md, CLAUDE.md, AGENTS.md to use `.collab/`
- Updated README.md with scaffolding instructions

**Registry created:**
- `projects/project-registry.md` â€” initial registry with Cortex as first entry

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
- `src/core/content-draft-generator.ts` â€” `LLMContentDraftGenerator` implementing `ContentDraftGenerator`. Uses `content_drafting` task type for ConfigRouter, loads thread-builder.md prompt, handles both thread (posts[]) and single-post (full_text) formats, supports draft revision with feedback.
- `src/core/podcast-distribution.ts` â€” `LLMPodcastDistributionGenerator` implementing `PodcastDistributionGenerator`. Builds episode prompt from PodcastEpisode metadata, returns youtube_description + company_tweet + personal_post.
- `src/core/content-seed-extractor.ts` â€” `LLMContentSeedExtractor` implementing `ContentSeedExtractor`. Loads content-extractor.md prompt, filters by confidence threshold, generates seed IDs with `nextSeedId`.
- `src/integrations/granola.ts` â€” Granola URL scraper. `isGranolaUrl()` detects Granola links, `fetchGranolaTranscript()` extracts text from HTML (main/article/content div, strips scripts/styles/tags).

### Files modified:
- `src/cli/content.ts` â€” Added all Phase 3b+3c subcommands:
  - `draft <id>` â€” generates draft for an idea via thread-builder
  - `revise <id> "feedback"` â€” revises existing draft with feedback
  - `podcast` â€” interactive episode input, generates distribution pack, saves as 3-idea chain (YouTube desc + @indexingco tweet + @ape_rture post)
  - `extract <file-or-url>` â€” runs file or Granola URL through seed extractor
  - `seeds` â€” lists unprocessed seeds
  - `promote <seed-id>` â€” converts seed to content idea
  - Updated `run()` switch and `runContent()` export for web terminal
- `src/cli/gm.ts` â€” Added Content Pipeline section to /gm briefing (idea counts by status, unprocessed seed count)
- `.cortex/tasks.md` â€” Moved Phase 3b+3c+integration tasks to Done

### Validation:
- `npm run typecheck` â€” clean
- `npm test` â€” 26/26 passed
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
- Created `src/core/types/events.ts` â€” normalized event model (StartedEvent, ActionEvent, CompletedEvent)
- Extended `src/core/types/routing.ts` â€” agent auto-router types (AgentAffinity, AgentRouteConfig, AgentRouter)
- Extended `src/core/types/session.ts` â€” resume tokens for cross-interface continuity
- Extended `src/core/types/task-queue.ts` â€” ThreadScheduler for per-context serialization
- Updated `src/core/types/orchestrator.ts` â€” integrated events + agent routing
- Updated barrel exports in `src/core/types/index.ts`
- Updated `projects/feature-roadmap.md` with Phase 5/7/8 additions
- Updated `context/model-routing-spec.md` with agent routing schema
- Created `decisions/2026-02-04-takopi-patterns.md`

### Phase 3 Content Pipeline (designed this session)

**Files created:**
- `src/core/types/content.ts` â€” all content pipeline types: ContentIdea, ContentSeed, ContentDraft, ContentChain, PodcastEpisode, PodcastDistributionPack, plus Store/Generator/Extractor interfaces
- `src/agents/prompts/thread-builder.md` â€” thread/post drafting prompt with Dennis's voice profile, platform rules, anti-patterns, examples
- `src/agents/prompts/podcast-distribution.md` â€” Block by Block distribution pack prompt (YouTube desc + @indexingco tweet + @ape_rture longform). Absorbs `block-by-block-distribution.md` into Cortex agent system
- `src/agents/prompts/content-extractor.md` â€” seed extraction prompt with confidence scoring, privacy rules, examples

**Files modified:**
- `src/core/types/index.ts` â€” added barrel exports for all content types
- `projects/content-ideas.md` â€” upgraded table format (added ID and Source columns)
- `projects/feature-roadmap.md` â€” Phase 3 now has sub-phases (3a/3b/3c/3d) with status tracking
- `.cortex/tasks.md` â€” added 10 Codex tasks across Phase 3a/3b/3c + integration

**Files created (templates):**
- `projects/content-seeds.md` â€” seed tracking (unprocessed/promoted)
- `projects/content-chains.md` â€” cross-platform recycling tracker
- `projects/content-drafts/.gitkeep` â€” draft storage directory

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

## 2026-02-18 codex -- Typed Capture System (Phase 8) implementation

- Implemented typed capture stores:
  - `src/core/research-store.ts`
  - `src/core/feature-store.ts`
  - `src/core/idea-store.ts`
- Added capture markdown parsing/serialization:
  - `parseResearchQueue()` / `serializeResearchQueue()`
  - `parseFeatureProposals()` / `serializeFeatureProposals()`
  - `parseProjectSeeds()` / `serializeProjectSeeds()`
  - Files: `src/utils/markdown.ts`, `src/utils/markdown.test.ts`
- Added `/capture` CLI in `src/cli/capture.ts` with typed subcommands, `/capture list [type]`, `/capture inbox`, and untagged auto-classification via `ConfigRouter.route()`
- Wired `/capture` into `src/core/command-registry.ts`, `src/cli/index.ts`, and `package.json`; added tests in `src/cli/capture.test.ts`
- Updated Telegram typed capture flow:
  - prefix parsing for `#research`, `#feature`, `#seed`, `#task`, `#content`, `#action` in `src/integrations/telegram/message-queue.ts`
  - `capture_type:*` tagging + tests in `src/integrations/telegram/message-queue.test.ts`
  - triage routing additions (`research`, `cortex_feature`, `project_seed`) and tag-based LLM skip in `src/agents/telegram-triage.ts`
- Added store tests:
  - `src/core/research-store.test.ts`
  - `src/core/feature-store.test.ts`
  - `src/core/idea-store.test.ts`
- Included shared typed-capture contracts/prompts/scaffolding from handoff:
  - `src/core/types/capture.ts`
  - `src/agents/prompts/telegram-triage.md`
  - `actions/research-queue.md`
  - `projects/feature-proposals.md`
  - `projects/ideas.md`
- Validation:
  - `node --import tsx --test src/core/research-store.test.ts src/core/feature-store.test.ts src/core/idea-store.test.ts src/utils/markdown.test.ts src/integrations/telegram/message-queue.test.ts src/cli/capture.test.ts` passed
  - `npm run typecheck` passed
  - `npm run test:unit` has unrelated pre-existing failures in `src/core/resume-token-store.test.ts`

---
## 2026-02-10 codex -- complete Phase 5 routing/scheduling follow-up

### Implemented remaining Phase 5 backend pieces

- Added `ConfigAgentRouter` in `src/core/agent-router.ts` implementing cascade selection: user directive > context glob match > task affinity > default agent, with tests in `src/core/agent-router.test.ts`
- Added `InMemoryThreadScheduler` in `src/core/thread-scheduler.ts` wrapping `TaskQueue` with per-thread serialization and cross-thread parallel limits, with tests in `src/core/thread-scheduler.test.ts`
- Added `FileResumeTokenStore` in `src/core/resume-token-store.ts` with file-backed persistence (`context/resume-tokens.json`), token ID generation via `crypto.randomUUID`, and default 7-day pruning, with tests in `src/core/resume-token-store.test.ts`
- Wired AutoRouter into orchestrator in `src/core/orchestrator.ts`: when trigger omits `agents`, orchestrator resolves one via AgentRouter while preserving explicit-agent behavior
- Updated trigger typing to allow optional `agents` in `src/core/types/orchestrator.ts`
- Updated impacted tests in `src/core/orchestrator.test.ts`, `src/cli/orchestrate.ts`, and `src/ui/handlers/phase2-api.test.ts`

### Validation

- `npm run typecheck` -- clean
- `npm run test:unit` -- 93 passed, 1 skipped, 0 failed

### Branch flow

- Implemented on `codex/auto-router`
- Merged to `main`
- Branch deleted

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

## 2026-02-09 codex -- orchestrator test pass + cron daemon support

- Added missing orchestrator-related unit coverage for memory update application in `src/core/memory-writer.test.ts` and validated existing `salience`, `permission-validator`, `agent-runner`, and `orchestrator` suites.
- Added `src/core/claude-code-process.test.ts` covering `extractJsonFromText`, `normalizeFinding`, `parseAgentResult`, and result subtype handling (`success`, non-success error subtype, `error_max_turns` salvage/escalation) using mocked SDK query streams.
- Added dependency-injectable hooks in `src/core/claude-code-process.ts` to make SDK query and prompt loading testable without network/process calls.
- Implemented cron runtime support with `node-cron`: `src/core/cron-scheduler.ts`, tests in `src/core/cron-scheduler.test.ts`, and daemon entrypoint `src/cli/daemon.ts`.
- Wired daemon execution: added `npm run daemon` script and exported daemon CLI in `src/cli/index.ts`.
- Added `/orchestrate` SSE event streaming in web terminal: `runOrchestrate()` now accepts `onEvent` callback (`src/cli/orchestrate.ts`) and `src/ui/handlers/chat.ts` streams live orchestrator agent events before final summary output.
- Fixed `MemoryWriter` flag path resolution to honor configured base path (`src/core/memory-writer.ts`), preventing temp-dir tests from writing to repo root.
- Files changed: `package.json`, `package-lock.json`, `src/core/claude-code-process.ts`, `src/core/memory-writer.ts`, `src/core/memory-writer.test.ts`, `src/core/claude-code-process.test.ts`, `src/core/cron-scheduler.ts`, `src/core/cron-scheduler.test.ts`, `src/cli/daemon.ts`, `src/cli/index.ts`, `src/cli/orchestrate.ts`, `src/ui/handlers/chat.ts`.
- Tests: `npm run typecheck`, `npm run test:unit`, `npm test` (all passing).

## 2026-02-09 codex -- phase 2 dashboard backend stores + APIs

- Implemented `src/ui/cycle-store.ts` for in-memory cycle summaries and per-agent health metrics (`last_ok`, run/error counts, average latency).
- Implemented `src/ui/review-store.ts` parsing `actions/review-queue.md` with durable status transitions (`approve`, `dismiss`, `snooze`) stored in `actions/review-state.json`.
- Added `src/ui/monitor-broker.ts` and new API handlers:
  - `src/ui/handlers/dashboard.ts` (`/api/dashboard`, `/api/dashboard/cycles`)
  - `src/ui/handlers/review.ts` (`/api/review`, `/api/review/:id/approve`, `/api/review/:id/dismiss`, `/api/review/:id/snooze`)
  - `src/ui/handlers/tasks.ts` (`/api/tasks` with `.cortex/tasks.md` parser)
  - `src/ui/handlers/monitor.ts` (`/api/monitor/stream` SSE + heartbeat)
  - `src/ui/handlers/orchestrator.ts` (`/api/orchestrate/trigger`, event fanout + cycle_complete publish)
- Updated handler wiring in `src/ui/handlers/index.ts`.
- Wired live orchestrator runtime into UI server in `src/ui/server.ts` (registering local watcher agents) and updated `src/ui/index.ts` app composition for runtime services + dashboard build/static fallback.
- Updated backend web types in `src/ui/types.ts` to include dashboard/review/task payload contracts.
- Tests added:
  - `src/ui/cycle-store.test.ts`
  - `src/ui/review-store.test.ts`
  - `src/ui/handlers/phase2-api.test.ts`
- Validation run:
  - `npm run typecheck`
  - `node --import tsx --test src/ui/cycle-store.test.ts src/ui/review-store.test.ts src/ui/handlers/phase2-api.test.ts`
  - `npm run test:unit`
  - `npm test`

## 2026-02-09 codex -- phase 3 dashboard frontend wiring

- Wired dashboard view to live API data in `src/ui/dashboard/src/views/dashboard.tsx`:
  - Pulls `/api/dashboard` and `/api/dashboard/cycles`
  - Auto-refreshes
  - Shows cycle summary, review count, task summary, agent health, recent cycles
- Wired monitor view in `src/ui/dashboard/src/views/monitor.tsx`:
  - Connects to `/api/monitor/stream` SSE
  - Tracks `agent_started`, `agent_action`, `agent_completed`, and `cycle_complete` events
  - Supports cycle triggering via `/api/orchestrate/trigger`
  - Shows live agent cards and cycle history
- Wired review queue view in `src/ui/dashboard/src/views/review.tsx`:
  - Loads `/api/review`
  - Actions wired to `/api/review/:id/approve`, `/dismiss`, `/snooze`
  - Auto-refreshes and handles per-item pending state
- Validation run:
  - `npm run build:dashboard`
  - `npm run typecheck`
  - `npm run test:unit`

## 2026-02-09 codex -- /project command wired into web terminal

- Updated `src/ui/handlers/chat.ts` command registry:
  - Imported `runProject` from `src/cli/project.ts`
  - Added `/project` command passthrough to project CLI arguments
  - Empty `/project` now defaults to `project status` (all projects)
- Supported usage paths in web terminal:
  - `/project status`
  - `/project list`
  - `/project status <id>`
- Validation run:
  - `npm run typecheck`
  - `npm run test:unit`

## 2026-02-10 codex -- project heartbeat phase 4

- Implemented project heartbeat core monitor in `src/core/project-heartbeat.ts` with `ProjectHealthReport` type additions in `src/core/types/project.ts` and barrel export update in `src/core/types/index.ts`.
- Added core coverage in `src/core/project-heartbeat.test.ts` (active-only project filtering, git metrics, error fallback).
- Wired `/gm` with a new "Project Health" section in `src/cli/gm.ts` that only lists unhealthy projects.
- Added local orchestrator agent `src/agents/project-heartbeat.ts` (+ prompt `src/agents/prompts/project-heartbeat.md`) and registered it in `context/orchestrator.json` (including a `quick` trigger).
- Registered local runtime wiring for the new agent in `src/cli/orchestrate.ts`, `src/cli/daemon.ts`, `src/ui/server.ts`, and default UI trigger list in `src/ui/handlers/orchestrator.ts`.
- Added backend endpoint `GET /api/projects/health` in `src/ui/handlers/projects.ts`, wired via `src/ui/handlers/index.ts` and `src/ui/index.ts`, with API test coverage in `src/ui/handlers/projects.test.ts`.
- Added dashboard Projects view in `src/ui/dashboard/src/views/projects.tsx`, including API wiring/types/nav/app/css updates in:
  - `src/ui/dashboard/src/api.ts`
  - `src/ui/dashboard/src/types.ts`
  - `src/ui/dashboard/src/app.tsx`
  - `src/ui/dashboard/src/components/nav.tsx`
  - `src/ui/dashboard/src/dashboard.css`
- Added shared UI API type in `src/ui/types.ts`.
- Validation run:
  - `node --import tsx --test src/core/project-heartbeat.test.ts src/ui/handlers/projects.test.ts`
  - `npm run test:unit`
  - `npm run typecheck`
  - `npm run build:dashboard`
  - `npm test`

## 2026-02-10 codex -- gmail integration phase 6

- Implemented Gmail integration client in `src/integrations/gmail.ts` (`GoogleGmailClient`) with multi-account auth (`indexing` + `personal`), list/get/unread/archive/trash/label/draft/labels APIs, and `/gm` summary helper `fetchMailSummary()`.
- Added mocked unit coverage in `src/integrations/gmail.test.ts` for multi-account setup, header parsing, full-body extraction, batch archive/trash/label ops, draft encoding, summary aggregation, and missing-refresh-token fallback.
- Added `/mail` CLI in `src/cli/mail.ts` with `inbox`, `search`, `read`, `labels`, and `unread` subcommands, exported in `src/cli/index.ts`, registered in `src/core/command-registry.ts`, and added `npm run mail` script in `package.json`.
- Updated `/gm` mail briefing in `src/cli/gm.ts` to include an Email section with unread totals per account and top urgent subjects, with graceful fallback warnings when Gmail is unavailable.
- Updated integration barrel export in `src/integrations/index.ts`.
- Validation run:
  - `node --import tsx --test src/integrations/gmail.test.ts`
  - `npm run typecheck`
  - `npm run test:unit`
- Branch: `codex/gmail-integration` merged to `main` and deleted locally.

## 2026-02-15 codex -- p3 slack message queue end-to-end pipeline

- Completed P3 Slack queue flow in local runtime:
  - Slack ingestion parser + enqueue metadata/dedupe in `src/integrations/slack/message-queue.ts`.
  - Queue worker processing + task status transitions + ref parsing in `src/integrations/slack/queue-worker.ts`.
  - Slack bot polling worker + threaded success/failure responses and batch controls in `src/cli/slack.ts`.
  - Queue admin utilities and `/queue` command (`status`, `failed`, `retry`) in `src/core/queue-admin.ts` and `src/core/command-registry.ts`.
- Queue markdown now preserves `Description` fields for long Slack prompts in `src/utils/markdown.ts`.
- Tests added:
  - `src/integrations/slack/message-queue.test.ts`
  - `src/integrations/slack/queue-worker.test.ts`
  - `src/core/queue-admin.test.ts`
  - Updated `src/utils/markdown.test.ts`
- Validation run:
  - `node --import tsx --test --test-isolation=none src/core/queue-admin.test.ts src/integrations/slack/message-queue.test.ts src/integrations/slack/queue-worker.test.ts src/utils/markdown.test.ts`
  - `npm run typecheck`

## 2026-02-15 codex -- p2 step 4 multi-tab chat sessions

- Implemented chat tab UX with max 3 sessions in `src/ui/dashboard/src/views/chat.tsx`:
  - Replaced sidebar session list with top tab bar.
  - Added capped creation (`MAX_CHAT_TABS = 3`) with disabled `+` when full.
  - Added close/select behavior per tab and default-session fallback when all are closed.
  - Added deterministic next tab naming (`Session N`) and stream cleanup on unmount.
- Added tab bar styling + mobile adjustments in `src/ui/dashboard/src/dashboard.css`.
- Validation run:
  - `npm run typecheck`
  - `npm run build:dashboard`

## 2026-02-15 codex -- p2 step 5 command and shortcut interception

- Added explicit command/shortcut interception layer in `src/core/command-interceptor.ts`:
  - Digest aliases (`eod`, `daily digest`, etc.) -> `/digest`
  - Queue aliases (`queue`, `tasks`, `retry failed`, etc.) -> `/queue ...`
  - Orchestrate alias (`orchestrate`) -> `/orchestrate`
- Wired interceptor before command routing in:
  - `src/core/command-registry.ts` (`resolveCommand`)
  - `src/ui/handlers/chat.ts` (so orchestrate streaming also works for shortcuts)
  - `src/cli/slack.ts` (shortcut parsing in Slack transport)
- Added tests in `src/core/command-interceptor.test.ts`.
- Validation run:
  - `node --import tsx --test --test-isolation=none src/core/command-interceptor.test.ts src/core/queue-admin.test.ts src/integrations/slack/message-queue.test.ts src/integrations/slack/queue-worker.test.ts src/utils/markdown.test.ts`
  - `npm run typecheck`

## 2026-02-16 codex -- telegram bot integration phase 7

- Implemented Telegram integration module in `src/integrations/telegram/`:
  - `types.ts`: `TelegramConfig`, `TelegramCommandContext`
  - `client.ts`: `readTelegramConfig()`, `createTelegramBot()`, `isAllowedUser()`
  - `formatter.ts`: `formatForTelegram()` (markdown -> Telegram HTML), `trimTelegramMessage()`
  - `message-queue.ts`: `parseTelegramQueueMessage()`, `enqueueTelegramMessage()` with Telegram refs/tags/dedupe
  - `queue-worker.ts`: queue execution path (`processNextTelegramQueuedTask`, batch processing, ref parsing)
  - `index.ts`: barrel export
- Added Telegram CLI entrypoint `src/cli/telegram.ts` with:
  - allowlist auth middleware (`TELEGRAM_ALLOWED_USER_IDS`)
  - `/orchestrate` streaming progress updates
  - shared command handling via `resolveCommand()`
  - queue capture fallback via `enqueueTelegramMessage()`
  - voice-message reply guard
  - optional queue auto-worker (`TELEGRAM_QUEUE_AUTOPROCESS`, `TELEGRAM_QUEUE_POLL_MS`, `TELEGRAM_QUEUE_BATCH_SIZE`)
  - graceful SIGINT/SIGTERM shutdown
- Wired exports/scripts:
  - added `telegram` script in `package.json`
  - exported CLI in `src/cli/index.ts`
  - exported integration in `src/integrations/index.ts`
  - added dependency `telegraf` in `package.json`/`package-lock.json`
- Updated queue admin + command routing for Telegram source support:
  - `src/core/queue-admin.ts`: Telegram counts in summary + source-aware failed/retry helpers, Slack aliases preserved
  - `src/core/command-registry.ts`: `/inbox` includes Slack + Telegram; `/queue failed` and `/queue retry failed` accept optional `slack|telegram` source
- Tests added/updated:
  - `src/integrations/telegram/formatter.test.ts`
  - `src/integrations/telegram/message-queue.test.ts`
  - `src/integrations/telegram/queue-worker.test.ts`
  - `src/core/queue-admin.test.ts` updated for Telegram coverage
- Validation run:
  - `npm run typecheck`
  - `npm run test:unit`
- Branch `codex/telegram-bot` merged to `main` and deleted locally.

## 2026-02-20 codex -- codex cli subprocess wrapper follow-up hardening

- Updated `src/core/codex-process.ts` to retain JSONL event parsing and add a resilient last-message fallback from JSONL `agent_message` events (`item.completed`) when `--output-last-message` output cannot be read.
- Added/updated tests in `src/core/codex-process.test.ts`:
  - Existing behavior (stdin prompt piping, JSONL parsing, non-zero exit handling, timeout kill path) remains covered.
  - New coverage verifies fallback to event-derived last message when output file is unavailable.
- Validation run:
  - `node --import tsx --test src/core/codex-process.test.ts`
  - `npm run typecheck`
- Branch `codex/ralph-codex-process` merged to `main` and deleted locally.


