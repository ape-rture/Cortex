# Cortex Feature Roadmap

**Created**: 2026-02-02
**Status**: Brainstorming -- features confirmed, order TBD

---

## Phase 0: Already Working (Current State)
- [x] Markdown-based memory system (`/context/`, `/actions/`, `/meetings/`, etc.)
- [x] Claude Code as primary interface
- [x] Session context via SYSTEM.md
- [x] Research ingestion and organization
- [x] Personal + company context files
- [x] Decision logging

## Phase 1: Core Loop (Make Daily Workflow Solid)

| Feature | Priority | Status | Notes |
|---|---|---|---|
| **Task queue** (`/actions/queue.md`) | P0 | Done | `MarkdownTaskQueue` in `src/core/task-queue.ts` |
| **Morning routine** (gm command) | P0 | Done | `npm run gm`. Calendar + tasks + git + decay + content pipeline + snapshot |
| **Session snapshots & warm handoff** | P0 | Done | `MarkdownSessionSnapshotStore` in `src/core/session-snapshot.ts` |
| **Daily digest** | P1 | Done | `npm run digest`. Generates EOD summary to `/daily/` |
| **Git push reminders** | P1 | Done | `SimpleGitMonitor` in `src/core/git-monitor.ts`. Integrated into /gm |
| **Shorthand/alias system** | P2 | Done | `MarkdownAliasStore` + `SimpleAliasPatternDetector` in `src/core/` |
| **Agent output schema** | P1 | Done | `src/core/types/agent-output.ts`. JSON schema for all runtime agents |

## Phase 2: Relationships & Sales

| Feature | Priority | Status | Notes |
|---|---|---|---|
| **CRM auto-sync** (Attio) | P0 | Partial | Local CRM done (`MarkdownContactStore`). Attio sync deferred |
| **Relationship decay alerts** | P1 | Done | `SimpleDecayDetector` in `src/core/decay-detector.ts`. Integrated into /gm |
| **Meeting prep autopilot** | P1 | Done | `npm run prep "Name"`. `LLMMeetingPrepGenerator` + `/prep` CLI |
| **FOCUS integration** | P1 | Deferred | Needs FOCUS API built first |
| **Telegram sales tracking** | P2 | Deferred | Phase 2d, complex parsing |

## Phase 3: Content Pipeline

Sub-phases: 3a (ideas tracker + store), 3b (thread builder + podcast distribution), 3c (seed extractor + Granola), 3d (cross-platform recycling)

| Feature | Sub-phase | Priority | Status | Notes |
|---|---|---|---|---|
| **Content ideas tracker + store** | 3a | P0 | Done | `MarkdownContentStore` + `npm run content`. Full CRUD + pipeline view |
| **Thread/post builder** | 3b | P1 | Done | `LLMContentDraftGenerator`. `npm run content draft/revise` |
| **Podcast distribution (Block by Block)** | 3b | P1 | Done | `LLMPodcastDistributionGenerator`. `npm run content podcast`. 3-idea chain per episode |
| **Content seed extractor** | 3c | P1 | Done | `LLMContentSeedExtractor`. `npm run content extract/seeds/promote` |
| **Granola URL scraping** | 3c | P1 | Done | `src/integrations/granola.ts`. Auto-detected by `content extract` |
| **Cross-platform recycling** | 3d | P2 | Types done | `ContentChain`/`ContentChainNode` types. Used by podcast command |
| **Marketing tool integration** | 3d | P2 | Deferred | API connection to Indexing Co marketing tool, possibly shared RAG/content DB |
| **Human in the loop** | — | P0 | Design principle | Draft -> approve -> publish. No auto-posting ever |
| **Audience intelligence** (X analytics) | — | P3 | Later roadmap | Need to figure out Twitter analytics integration first |

## Phase 4: Code Productivity

| Feature | Priority | Status | Notes |
|---|---|---|---|
| **Project registry** | P0 | Types done | Track external projects in `projects/project-registry.md`. Types at `src/core/types/project.ts` |
| **Cross-folder git ops** | P0 | Designed | Push/pull/status for projects in other directories. Safety guardrails for main branch |
| **Collaboration template scaffold** | P1 | Template ready | `npm run project scaffold "Name" /path`. Copies `.collab/` + instruction files |
| **Project CLI** | P1 | Queued | `npm run project list/add/status/push/pull/scaffold`. Codex tasks added |
| **Project heartbeat** | P1 | Confirmed | Track: last commit age, blockers, stale branches, failing tests. Weekly health view |
| **Dependency & security watch** | P2 | Confirmed | Monitor vulns, breaking changes, deprecations in active projects |
| **Pen testing support** | P3 | Confirmed | Help run and interpret security audits when needed |
| **Architecture Decision Records** | P3 | Maybe | Lightweight ADRs during vibe coding. Not priority |

## Phase 5: Self-Evolution

| Feature | Priority | Status | Notes |
|---|---|---|---|
| **Self-improvement on command** | P1 | Designed | "Fix this", "optimize that" -> read own code -> propose fix -> apply after approval |
| **Proactive feature suggestions** | P1 | Designed | Detect repeated patterns -> propose automation. Surface in `/projects/feature-proposals.md` |
| **Bug detection & self-repair** | P1 | Designed | Log failures -> diagnose -> self-patch on command -> track regressions |
| **Orchestrator MVP** | P0 | Done | `CortexOrchestrator` in `src/core/orchestrator.ts`. `npm run orchestrate`. 3 local agents, rule-based salience, fame threshold filtering |
| **First runtime agents** | P1 | Done | Sales Watcher + Content Scanner + Code Watcher in `src/agents/`. All `local_script`, zero LLM cost |
| **Agent permission envelopes** | P1 | Done | `PermissionValidator` in `src/core/permission-validator.ts`. Glob-match validation. Config in `context/orchestrator.json` |
| **Compound knowledge** (nightly) | P2 | Designed | Synthesize memory, merge notes, surface stale items, update contacts (Memory Synthesizer agent) |
| **Model performance tracking** | P2 | Confirmed | Per-task metrics (latency, tokens, success rate, cost) -> tune routing |
| **Routing optimization** | P2 | Confirmed | Suggest model switches based on accumulated performance data |
| **Normalized event model** | P0 | Done | `src/core/types/events.ts` + emitted by `AgentRunner`. StartedEvent/CompletedEvent emitted per agent per cycle. Takopi-inspired |
| **Agent AutoRouter** | P1 | Types done | Agent dispatching layer above model routing. Task → agent → model cascade. Extends `src/core/types/routing.ts`. Takopi-inspired |
| **Resume tokens** | P1 | Types done | Lightweight cross-interface session continuity. Extends `src/core/types/session.ts`. Takopi-inspired |
| **ThreadScheduler** | P1 | Types done | Per-context serialization, cross-context parallelism. Extends `src/core/types/task-queue.ts`. Takopi-inspired |

## Phase 5.5: Memory Flywheel

| Feature | Priority | Status | Notes |
|---|---|---|---|
| **Atomic fact schema** | P0 | Designed | `items.json` per entity: id, fact, category, timestamp, source, status, supersededBy. See `research/03-clawdbot-memory-system.md` |
| **Real-time extraction** | P0 | Designed | Haiku-class sub-agent extracts durable facts from conversations (~30 min intervals, ~$0.001/run) |
| **Knowledge graph structure** | P1 | Designed | Entity-based storage: `summary.md` (living summary) + `items.json` (atomic facts) per entity |
| **Weekly synthesis** | P1 | Designed | Sunday job: rewrite summaries, mark superseded facts, surface stale items |
| **Generalized decay detection** | P1 | Designed | Extend SimpleDecayDetector beyond contacts to all knowledge graph entities |
| **Tiered retrieval** | P2 | Designed | Load summaries first, drill into items.json only when detail is needed. Token-efficient |

## Phase 6: Meta-Productivity

| Feature | Priority | Status | Notes |
|---|---|---|---|
| **Weekly review ritual** | P1 | Confirmed | Sunday/Monday: shipped, slipped, patterns, pending decisions, contacts |
| **Energy-aware scheduling** | P2 | Confirmed | Detect work patterns, suggest optimal time blocks via Calendar |

## Phase 1.5: Web Terminal MVP

| Feature | Priority | Status | Notes |
|---|---|---|---|
| **Browser chat interface** | P0 | Done | Localhost Hono server + Preact frontend. Multi-session support for parallel testing |
| **SSE streaming** | P1 | Done | Server-Sent Events for response streaming. Full response for MVP, token streaming later |
| **Session management** | P1 | Done | In-memory session store. No auth (localhost only) |
| **CLI command parity** | P1 | Done | Command registry in `chat.ts`. All commands wired: `/gm`, `/digest`, `/prep`, `/content`, `/tasks`, `/contacts`, `/snapshot` |

## Phase 7: Interface & Always-On

| Feature | Priority | Status | Notes |
|---|---|---|---|
| **Slack `#cortex` queue bot** | P1 | Designed | Slack bot appends commands/notes to queue file. Process at desk or in real-time |
| **Slack bridge with LLM** | P2 | Designed | Upgrade bot to invoke Claude API, respond in thread |
| **Telegram bidirectional interface** | P1 | Designed | Upgrade from read-only → full command interface (like Slack). Takopi as reference implementation. See `research/12-takopi-telegram-bridge.md` |
| **Telegram sales tracking** | P2 | Designed | Monitor sales chats, extract contact context (read-only layer on top of bidirectional interface) |
| **Progress streaming** | P1 | Designed | Real-time agent event streaming to Slack/Telegram/Web UI. Depends on Phase 5 event model. Takopi-inspired |
| **Cross-interface resume** | P1 | Designed | Continue conversations across CLI/Slack/Telegram/Web using resume tokens from Phase 5 |
| **Full orchestrator** | P1 | Designed | Parallel agents, LLM-scored salience, webhook/Slack/cron triggers. Full Dennettian Multiple Drafts |
| **Agent-to-agent triggers** | P2 | Idea | Agents can spawn other agents (e.g., Content Creator -> Thread Builder) |
| **Custom web UI** | P3 | Idea | Full dashboard: queue, projects, content, relationships. Real product territory |

## Phase 8: Sharing & Open Source

| Feature | Priority | Status | Notes |
|---|---|---|---|
| **Modular architecture** | P0 | Design principle | Every feature = separable module with clear I/O |
| **PII/key scrub before publish** | P0 | Design principle | Automated check before sharing any module |
| **Shareable MCP servers** | P2 | Idea | Package useful integrations as standalone MCP servers |
| **Shareable skills** | P2 | Idea | Claude Code skills that others can drop in |
| **Agent templates** | P3 | Idea | Publishable agent configurations with docs |
| **Swarm pattern template** | P3 | Idea | The orchestrator + agents pattern itself as a shareable open-source framework |
| **Plugin architecture** | P2 | Idea | TypeScript plugin system for engines, transports, and commands. Inspired by Takopi's Python entrypoints model. See `research/12-takopi-telegram-bridge.md` |

## Phase 9: Intelligent Retrieval

| Feature | Priority | Status | Notes |
|---|---|---|---|
| **ACT-R activation scoring** | P1 | Idea | Memories ranked by recency × frequency, power-law decay. Generalizes Dennett's "fame threshold" |
| **Content corpus integration** | P1 | Idea | Index personal + Indexing Co content for retrieval and recycling |
| **Vector embeddings** | P2 | Idea | Semantic search across markdown files, facts, and content |
| **Hybrid retrieval (RRF)** | P2 | Idea | Combine vector + FTS with Reciprocal Rank Fusion for best-of-both search |
| **Dynamic user modeling** | P3 | Idea | Learn patterns from memory access, predict context needs |

---

## Decisions Resolved (2026-02-02)

See `decisions/2026-02-02-blocking-decisions.md` for full rationale.

| # | Decision | Choice |
|---|---|---|
| 1 | Programming language | **TypeScript / Node.js** |
| 2 | Interface | **Slack `#cortex` channel** (command input) + Telegram (read-only data source) |
| 3 | Local models | **Defer -- cloud only** (Claude + Codex). Ollama when GPU available |
| 4 | Routing | **Static rules + user override.** Multi-provider: Anthropic + OpenAI |
| 5 | Deployment | **Local primary + cheap VPS** (Slack bot + Telegram listener + file sync) |
| 6 | Security | **Layered by phase.** Human-in-the-loop non-negotiable |
| 7 | Marketing tool | **Same TS stack, shared content DB, API bridge** |

---

*Update as features are confirmed, started, or completed.*
