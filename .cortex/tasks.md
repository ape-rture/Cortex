# Task Board

*Dennis assigns tasks here. Agents pick up their assigned work.*

---

## Queued

*Add tasks with `Agent: claude` or `Agent: codex` to assign.*

### Phase 3a: Content Ideas

- **Add content markdown utilities** -- Agent: codex -- `parseContentIdeas`, `serializeContentIdeas`, `parseContentDraft`, `serializeContentDraft`, `parseContentSeeds`, `serializeContentSeeds` in `src/utils/markdown.ts`. Follow `parseTaskQueue` pattern. Types: `src/core/types/content.ts`. Unit tests required.

- **Implement MarkdownContentStore** -- Agent: codex -- `src/core/content-store.ts` implementing `ContentStore` interface. Files: `projects/content-ideas.md`, `projects/content-drafts/{id}.md`, `projects/content-seeds.md`. Follow `MarkdownContactStore` pattern. Unit tests required.

- **Implement content CLI (list/add/status/pipeline)** -- Agent: codex -- `src/cli/content.ts` with subcommands: `list` (filter by status/platform), `add` (interactive idea capture), `status <id> <new-status>` (update lifecycle), `pipeline` (overview of ideas by status). Add `"content"` npm script in `package.json`. Follow `prep.ts` pattern.

### Phase 3b: Thread Builder + Podcast

- **Implement LLMContentDraftGenerator** -- Agent: codex -- `src/core/content-draft-generator.ts` implementing `ContentDraftGenerator`. Use `content_drafting` task type for ConfigRouter. Load prompt from `src/agents/prompts/thread-builder.md`. Parse JSON response (`posts[]` for threads, `full_text` for singles). Unit tests required.

- **Implement PodcastDistributionGenerator** -- Agent: codex -- `src/core/podcast-distribution.ts` implementing `PodcastDistributionGenerator`. Load prompt from `src/agents/prompts/podcast-distribution.md`. Takes `PodcastEpisode` input, returns `PodcastDistributionPack` (youtube_description + company_tweet + personal_post). Unit tests required.

- **Add draft/revise/podcast subcommands to content CLI** -- Agent: codex -- Extend `src/cli/content.ts`: `draft <id>` generates draft for an idea using thread-builder. `revise <id> "feedback"` revises existing draft. `podcast <episode-number> "title"` interactive episode input, generates distribution pack, saves as linked content ideas (3 ideas in chain: YouTube desc + @indexingco tweet + @ape_rture post).

### Phase 3c: Seed Extraction + Granola

- **Implement LLMContentSeedExtractor** -- Agent: codex -- `src/core/content-seed-extractor.ts` implementing `ContentSeedExtractor`. Load prompt from `src/agents/prompts/content-extractor.md`. Generate seed IDs (`seed-YYYY-MM-DD-NNN`). Filter by confidence threshold. Unit tests required.

- **Implement Granola URL scraper** -- Agent: codex -- `src/integrations/granola.ts`. Fetch Granola shareable link, extract meeting transcript content (HTML scrape). Return structured text for the seed extractor. Handle errors gracefully. Unit tests required.

- **Add extract/seeds/promote subcommands to content CLI** -- Agent: codex -- Extend `src/cli/content.ts`: `extract <file-or-url>` runs file or Granola URL through seed extractor. `seeds` lists unprocessed seeds. `promote <seed-id>` converts seed to content idea.

### Phase 3 Integration

- **Add content pipeline section to /gm** -- Agent: codex -- In `src/cli/gm.ts`, add Content Pipeline section: idea counts by status, items in review/approved, unprocessed seed count. Follow existing /gm section pattern.

## In Progress

*Agent moves task here when starting.*

*No tasks currently in progress.*

## Done

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

