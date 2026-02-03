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
| **Task queue** (`/actions/queue.md`) | P0 | Designed | Async work between sessions, survives session boundaries |
| **Morning routine** (gm command) | P0 | Designed | Calendar + pending + queue + FOCUS alerts + Attio decay |
| **Session snapshots & warm handoff** | P0 | Designed | Auto-capture mental state on session end, reconstruct on start |
| **Daily digest** | P1 | Designed | EOD summary -> `/daily/`, what happened, what's open |
| **Git push reminders** | P1 | Designed | Detect unpushed commits, remind |
| **Shorthand/alias system** | P2 | Designed | Emerge from patterns, Cortex suggests, tracked in `/context/aliases.md` |
| **Agent output schema** | P1 | Designed | Standardized JSON schema all runtime agents return. Foundation for orchestrator |

## Phase 2: Relationships & Sales

| Feature | Priority | Status | Notes |
|---|---|---|---|
| **CRM auto-sync** (Attio) | P0 | Designed | Local-only first, then Attio sync. Types at `src/core/types/crm.ts` |
| **Relationship decay alerts** | P1 | Designed | 30-day silence detection, integrated into /gm |
| **Meeting prep autopilot** | P1 | In Progress | One-page brief via /prep command. Interface + prompt done, Codex implementing |
| **FOCUS integration** | P1 | Deferred | Needs FOCUS API built first |
| **Telegram sales tracking** | P2 | Deferred | Phase 2d, complex parsing |

## Phase 3: Content Pipeline

| Feature | Priority | Status | Notes |
|---|---|---|---|
| **Content ideas tracker** | P0 | Designed | `/projects/content-ideas.md`, idea -> outline -> draft -> review -> publish |
| **Thread/post builder** | P1 | Confirmed | Give take -> draft thread -> iterate -> queue for posting |
| **Content recycler** | P1 | Confirmed | Detect insights from Granola, Slack, conversations -> content seeds |
| **Granola as content source** | P1 | Confirmed | Auto-extract publishable insights from meeting transcripts |
| **Cross-platform recycling** | P2 | Confirmed | YouTube -> thread -> LinkedIn post -> newsletter. Track the chain |
| **Marketing tool integration** | P2 | Confirmed | API connection to Indexing Co marketing tool, possibly shared RAG/content DB |
| **Human in the loop** | P0 | Design principle | Draft -> approve -> publish. No auto-posting ever |
| **Audience intelligence** (X analytics) | P3 | Later roadmap | Need to figure out Twitter analytics integration first |

## Phase 4: Code Productivity

| Feature | Priority | Status | Notes |
|---|---|---|---|
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
| **Orchestrator MVP** | P0 | Designed | Node.js scheduler. Spawns 2-3 agents on cron. Hybrid rules + small model salience. See `decisions/2026-02-02-dennett-architecture.md` |
| **First runtime agents** | P1 | Designed | Sales Watcher + Content Creator as first autonomous agents |
| **Agent permission envelopes** | P1 | Designed | Scoped read/write/API access per agent. Security separation enforced |
| **Compound knowledge** (nightly) | P2 | Designed | Synthesize memory, merge notes, surface stale items, update contacts (Memory Synthesizer agent) |
| **Model performance tracking** | P2 | Confirmed | Per-task metrics (latency, tokens, success rate, cost) -> tune routing |
| **Routing optimization** | P2 | Confirmed | Suggest model switches based on accumulated performance data |

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
| **CLI command parity** | P1 | In Progress | Wire `/gm`, `/digest` to real functions. Quick wire-up first, then full registry |

### Command Registry Architecture (Future)

Full plan for bringing CLI parity to web terminal:

**1. Command Registry** (`src/ui/commands.ts`)
```typescript
type CommandHandler = (args?: string) => Promise<string>;
const commands: Record<string, CommandHandler> = {
  "/gm": () => runMorningBriefing(),
  "/digest": () => runDailyDigest(),
  "/prep": (args) => runMeetingPrep(args),  // future
  "/tasks": () => showTaskQueue(),           // future
  "/contacts": (args) => searchContacts(args), // future
  "/snapshot": () => showSnapshot(),         // future
};
```

**2. Chat Handler Intercept** (in `chat.ts` before LLM routing)
- Check if message starts with `/`
- Look up handler in registry
- If found: execute, return result directly (skip LLM)
- If not found: pass through to LLM

**3. Hybrid Mode** (optional enhancement)
- `/gm` → raw briefing output
- `/gm summarize` → briefing + LLM summary
- Useful for commands that benefit from LLM interpretation

**4. Future Commands**
| Command | Function | Priority |
|---------|----------|----------|
| `/gm` | Morning briefing | P0 - now |
| `/digest` | Daily digest | P0 - now |
| `/prep <name>` | Meeting prep | P1 - after Phase 2c |
| `/tasks` | Show task queue | P2 |
| `/contacts <query>` | Search contacts | P2 |
| `/snapshot` | Current session snapshot | P2 |

## Phase 7: Interface & Always-On

| Feature | Priority | Status | Notes |
|---|---|---|---|
| **Slack `#cortex` queue bot** | P1 | Designed | Slack bot appends commands/notes to queue file. Process at desk or in real-time |
| **Slack bridge with LLM** | P2 | Designed | Upgrade bot to invoke Claude API, respond in thread |
| **Telegram listener (read-only)** | P2 | Designed | Monitor sales chats, extract contact context. Never sends messages |
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
