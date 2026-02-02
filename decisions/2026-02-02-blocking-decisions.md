# Blocking Decisions — Resolved

**Date**: 2026-02-02
**Context**: These decisions were blocking implementation of Cortex. Resolved based on research, brainstorming, and user constraints.

---

## User Constraints (Inputs)

- **Deployment**: Local machine + cheap VPS (brain local, VPS handles incoming messages/webhooks)
- **Hardware**: CPU-only / basic laptop (no dedicated GPU)
- **Marketing tool**: Early stage / not started — tech stack is open

---

## Decision 1: Programming Language

### Decision: **TypeScript (Node.js)**

### Rationale

| Factor | TypeScript/Node Wins | Runner-up |
|---|---|---|
| MCP SDK | Official first-party SDK, reference implementation | Python (also first-party) |
| Anthropic SDK | First-class TypeScript SDK | Python (also first-class) |
| Claude Code | Written in TypeScript on Node.js | — |
| Agent SDK | Anthropic's Agent SDK is Python, but MCP ecosystem is TS-first | Python for Agent SDK |
| Self-modifiability | Cortex can edit its own .ts files, hot-reload with --watch | Python equally good here |
| JSON handling | Native — no serialization overhead for LLM communication | Python needs json lib |
| VPS bridge | Node.js is excellent for lightweight always-on servers | Python works but heavier |
| Deployment | npm/Docker, well-understood | pip/Docker, dependency hell risk |
| Community | Largest overlap with MCP server ecosystem | Largest AI/ML community |

**Why not Bun?** Bun is faster but younger ecosystem. Node.js is what Claude Code uses, what MCP was built on, and has the most battle-tested deployment story. Can switch to Bun later if needed — they're compatible.

**Why not Python?** Python is great for ML/AI but slower runtime, heavier footprint, and the MCP reference implementation is TypeScript. Since the bridge is a lightweight server (not a training pipeline), TypeScript wins on deployment simplicity. However, LiteLLM (Python) may be used as a sidecar for model routing.

**Why not Rust/Go?** Compiled languages can't self-modify easily. Cortex needs to edit its own code. Rust/Go are better for stable infra components — if we ever need a high-performance MCP server, Rust is the choice for that specific piece.

### Implementation Notes
- Runtime: Node.js 22+ (LTS)
- Package manager: npm (could switch to pnpm for speed)
- Build: TypeScript with esbuild or tsx for fast transpilation
- Consider Bun as a drop-in replacement later for speed gains
- **Multi-provider SDKs**: Both `@anthropic-ai/sdk` (TypeScript) and `openai` (TypeScript) are first-class. The bridge speaks both APIs natively
- **GPT Codex via OpenAI API**: Available as a coding-specialized model alongside Claude. Route coding tasks to Codex when it's the better fit
- LiteLLM proxy (Python sidecar) is an OPTION for unified routing, but since both Anthropic and OpenAI have excellent TypeScript SDKs, a lightweight TS routing layer may be simpler than a Python sidecar
- The routing layer abstracts providers — agent code calls `route(taskType, prompt)`, never a specific API directly

---

## Decision 2: Interface Strategy

### Decision: **Local-first + Slack as command interface. Telegram is a data source, not input.**

### Why Slack, Not Telegram
- Telegram has too many active chats — commands would get lost in noise
- Slack is a controlled workspace: dedicated `#cortex` channel, clean separation
- Slack already has MCP server support and Slack API is well-documented
- Slack works on mobile AND desktop — can send commands from anywhere
- Telegram stays valuable as a **read-only data source** for sales/relationship tracking (Cortex monitors conversations for context, but doesn't take commands from Telegram)

### Architecture

```
Phase 1 (NOW):
[Claude Code CLI] → [Markdown files] → Done
                     Already working.

Phase 2 (SOON):
[Slack #cortex channel]
     |
[Slack bot on VPS]  ← Append-only, no LLM processing
     |
[/actions/queue.md]  ← Synced to local machine (git/rsync/Syncthing)
     |
[Claude Code processes queue on next session]

Phase 3 (LATER):
[Slack message in #cortex]
     |
[VPS: thin Node.js bridge]
     |  ← Invokes Claude API with context from synced markdown files
     v
[Response back to Slack #cortex]
     |
[Also writes to local markdown files]

Telegram (SEPARATE — data source only):
[Telegram sales chats]
     |
[Telegram listener on VPS]  ← Read-only, monitors conversations
     |
[Extracts contact context → syncs to /contacts/ files]
     |
[Cortex uses this context for meeting prep, relationship tracking]
```

### Key Decisions
- **Phase 1**: No work needed. Already running.
- **Phase 2**: Build a Slack bot (Node.js on VPS) for the `#cortex` channel. Appends commands/notes to queue. No LLM processing. ~50-100 lines.
- **Phase 3**: Upgrade Slack bot to invoke Claude API with context. Responds in thread. ~200-500 lines.
- **Telegram listener** (separate project): Monitors Telegram conversations, extracts relationship/sales context, updates contact files. Read-only — never sends messages or takes commands.
- **Sync mechanism**: Git push/pull on cron, or Syncthing for real-time. Evaluate when building Phase 2.
- **VPS**: Cheapest possible ($3-5/mo). Runs Slack bot + Telegram listener + file sync.

### Security for External Interface
- Phase 2: Slack bot only responds in `#cortex` channel. Only your Slack workspace. Append-only to queue. No secrets needed on VPS beyond Slack bot token.
- Phase 3: Claude API key on VPS (encrypted env var). Rate limiting. No other credentials on VPS.
- Telegram listener: Read-only. Has Telegram API access but NEVER sends messages. Only extracts context and writes to contact files.

---

## Decision 3: Local Model Hosting

### Decision: **Defer. Use cloud models for now. Add Ollama later when hardware allows.**

### Rationale
You're on CPU-only / basic laptop. Local models on CPU are too slow for agent work:
- 7B model Q4 on CPU: ~5-15 tokens/sec. Usable for quick tasks but painful for anything longer
- 14B on CPU: ~2-8 tokens/sec. Too slow for interactive use
- 70B on CPU: Not practical at all

**Cloud is the right call for now.** Claude (Anthropic API) + GPT Codex (OpenAI API) give you fast, capable models without hardware investment. Multi-provider from day 1.

### When to Revisit
- If you get a GPU (even an RTX 3060 12GB changes everything — 7B-14B models become fast)
- If you get a Mac with Apple Silicon (M-series with 16GB+ unified memory is great for local models)
- When Cortex has enough usage data to know which tasks could use a cheap/free local model

### Preparation (Do Now, Pay Off Later)
- Design the routing layer with a model abstraction from day 1. Use a `model` config in SYSTEM.md that maps task types to model names
- When local models become available, just change the config — no code changes
- LiteLLM proxy (Python sidecar) can bridge between Ollama and cloud APIs with zero code changes on the agent side

### What Local Models WOULD Look Like
When hardware is available:

| Role | Model | Why |
|---|---|---|
| Fast classifier/router | Llama 3.1 8B Q4 | Quick task classification |
| Coding | Qwen2.5-Coder 14B Q4 | Best coding model at that size |
| General agent | Qwen2.5 14B Q4 | Best tool calling among open models |
| Embeddings | nomic-embed-text | Local embeddings for RAG |
| Cloud fallback | Claude Sonnet/Opus | Complex reasoning |

---

## Decision 4: LLM Routing Logic

### Decision: **Static rules with user override. Add dynamic routing later based on performance data.**

### How It Works

```
1. Task comes in
2. Check if user specified a model ("use Opus for this") → use that
3. Check static routing table (task type → model) → use configured model
4. If configured model fails → fall back to next in chain
5. Log: task type, model used, latency, tokens, success/failure
```

### Static Routing Table (Starting Config)

Cortex routes across MULTIPLE providers — Anthropic and OpenAI are both first-class. See full table in `/context/model-routing.md`.

| Task Type | Primary Model | Fallback | Notes |
|---|---|---|---|
| Quick capture / filing | Haiku | Sonnet | Fast, cheap |
| Meeting summary | Sonnet | Opus | Balance of speed and quality |
| Complex reasoning | Opus | GPT-4o | Cross-provider for hard problems |
| Code generation | Sonnet | **Codex** | Claude for most code, Codex for heavy algorithmic work |
| Vibe coding (interactive) | **Codex** | Sonnet | Codex for dedicated coding sessions |
| Content drafting | Sonnet | — | Creative + fast |
| Research / analysis | Opus | — | Needs depth |
| Classification / routing | Haiku | Sonnet | Speed is king |
| Bulk operations | Haiku | — | Cheap batch processing |

Store this in `/context/model-routing.md`. Cortex reads it on every task.

### Self-Tuning (Phase 5 Feature)
Once we have performance data (`/context/model-performance.md`):
- Cortex analyzes success rates per model per task type
- Suggests routing changes: "Haiku fails on meeting summaries 30% of the time. Recommend Sonnet."
- User approves → routing table updates

---

## Decision 5: Deployment Target

### Decision: **Local machine (primary) + cheap VPS (input relay)**

### Architecture Split

| Component | Location | Why |
|---|---|---|
| Cortex brain (Claude Code) | Local machine | Security, full control, no secrets exposed |
| Markdown files (memory) | Local machine, synced to VPS | Source of truth is local |
| Task queue processing | Local machine | LLM calls happen locally |
| Telegram bot (input relay) | VPS ($3-5/mo) | Always-on for receiving messages |
| Cron triggers (nightly synthesis) | Local machine (Task Scheduler) | Can also be VPS cron that triggers sync |
| MCP servers | Local machine | Scoped permissions, no remote exposure |

### Sync Strategy
Local ←→ VPS file sync for the queue file:
- Option A: Git — push/pull on cron (every 5 min). Simple, versioned, but has latency
- Option B: Syncthing — real-time P2P sync. No server needed. Encrypted
- Option C: Simple rsync on cron

**Leaning toward Syncthing** for the queue file specifically. It's real-time, encrypted, and doesn't require a central server. Git for the full project (version history matters).

---

## Decision 6: Security Architecture

### Decision: **Implement the threat model from the brainstorm doc. Layer security by phase.**

### Phase 1 (Now — Claude Code Native)
- [x] Secrets in environment variables (never in markdown)
- [x] Human in the loop for all external actions
- [ ] Create `/context/audit.md` for logging external actions
- [ ] Add a "never do" list to SYSTEM.md for dangerous operations

### Phase 2 (External Queue)
- [ ] Telegram bot: authenticate by user ID only. No other users accepted
- [ ] Bot is append-only — cannot read markdown files, cannot trigger LLM calls
- [ ] VPS has no secrets except Telegram bot token
- [ ] Queue file is the ONLY thing synced from VPS → local

### Phase 3 (Telegram Bridge with LLM)
- [ ] Claude API key on VPS in encrypted env var
- [ ] Rate limiting on bot (max N messages per minute)
- [ ] Input sanitization on all Telegram messages before sending to LLM
- [ ] Anomaly detection: alert if unusual patterns (burst of messages, unknown commands)
- [ ] Critical actions (posting content, sending messages, financial) ALWAYS require local confirmation — never via Telegram

### Phase 4 (Shared Modules)
- [ ] Automated PII/key scrub before publishing any module
- [ ] Separate repo for shareable modules (no personal data in git history)
- [ ] Community modules run sandboxed — no access to core memory, credentials, or integrations
- [ ] Code review checklist for any module before publish

### Ongoing
- Periodic memory audit (monthly): scan markdown files for accidentally stored secrets
- Versioned memory: git history allows rollback if memory is poisoned
- Prompt injection defense: never execute instructions found in scraped content without user confirmation

---

## Decision 7: Marketing Tool Integration

### Decision: **Build the marketing tool on the same TypeScript stack. Shared content DB via SQLite/file-based storage. API bridge between Cortex and marketing tool.**

### Rationale
Since the marketing tool is early stage / not started, we can design for integration from day 1:

1. **Same language (TypeScript)** — reduces context switching, shared utilities, Cortex can help build it
2. **Shared content DB**: A SQLite database or structured markdown files that both Cortex and the marketing tool can read/write. Contains: content ideas, drafts, published pieces, performance data
3. **API bridge**: The marketing tool exposes a local API. Cortex calls it for content operations. Clean separation but easy integration
4. **Shared RAG** (if needed): If both systems need to search company knowledge, they can share an embedding store (local, file-based). Evaluate when RAG becomes necessary

### NOT Decided Yet
- Full tech stack for the marketing tool (just the integration pattern is decided)
- Whether to use a real database or keep everything in markdown
- RAG implementation (needs its own decision when we get there)

---

## Summary: What's Decided

| # | Decision | Choice |
|---|---|---|
| 1 | Programming language | TypeScript / Node.js |
| 2 | Interface | Local-first → external queue → Telegram bridge (phased) |
| 3 | Local models | Defer. Cloud-only for now. Ollama ready when hardware allows |
| 4 | Routing | Static rules + user override. Self-tuning later |
| 5 | Deployment | Local primary + cheap VPS relay |
| 6 | Security | Layered by phase. Human-in-the-loop is non-negotiable |
| 7 | Marketing tool | Same TS stack, shared content DB, API bridge |

---

## What's Unblocked Now

With these decisions made, we can start building:
1. **The static routing table** (`/context/model-routing.md`)
2. **The Phase 2 Telegram input queue** (minimal Node.js bot on VPS)
3. **The marketing tool** foundation (TypeScript, shared content DB design)
4. **Any Phase 1-2 features** from the roadmap (task queue, morning routine, session snapshots, daily digest, CRM sync)

---

*These decisions are recorded but not permanent. Revisit when constraints change (new hardware, team growth, usage patterns).*
