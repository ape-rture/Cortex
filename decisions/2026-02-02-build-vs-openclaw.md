# Decision: Build Custom Agent System vs. Modify OpenClaw

**Date**: 2026-02-02
**Status**: Brainstorming -- not yet decided
**Context**: Researched 18+ sources on Clawdbot/OpenClaw, multi-agent architectures, security, memory systems, and AI agent philosophy. Now evaluating the path forward for Cortex.

---

## What We're Actually Deciding

Not "should I have a personal assistant" -- that's decided. The question is:

**What is the right foundation for Cortex+**

Options:
1. **Fork/modify OpenClaw** -- Use it as the base, customize on top
2. **Build custom from scratch** -- Design Cortex's architecture ourselves
3. **Hybrid** -- Use OpenClaw for some layers, build others custom
4. **Claude Code native** -- Skip the framework entirely, build on Claude Code + MCP directly

---

## What Cortex Needs (Non-Negotiable)

From SYSTEM.md and research sessions:

| Requirement | Notes |
|---|---|
| Persistent memory (3-layer) | Knowledge graph + daily notes + tacit knowledge |
| Task queue | Async work between sessions |
| Multi-channel input | Telegram, VS Code, terminal, Claude Code desktop |
| Self-improvement loop | Review, learn, update own instructions |
| Build & share agents | Create subagents, publish modular components |
| Security separation | Sandboxed execution, least privilege, credential isolation |
| Modularity | Plugin architecture, shareable components |
| Multi-LLM support | Route to best model per task (cost/speed/capability) |
| Context about me | Deep personal/professional knowledge, compounding |
| Vibe coding support | Project scaffolding, planning, execution |
| Content pipeline | Ideas -> drafts -> publish across platforms |
| Integration layer | Calendar, Slack, GitHub, Attio, own apps |

---

## Option 1: Fork OpenClaw

### What You Get for Free
- Telegram/WhatsApp/Discord/Slack/iMessage integration
- WebSocket gateway (always-on messaging)
- Persona system (IDENTITY.md, USER.md, MEMORY.md)
- Skills/plugin architecture (MIT licensed)
- Sandboxed execution
- Node.js runtime (v22+)
- Active community, bugs being fixed
- Multi-model support already built in

### What You'd Have to Build On Top
- Three-layer memory system (OpenClaw has MEMORY.md but not the full knowledge graph + compounding engine)
- Task queue (doesn't exist in OpenClaw)
- Self-improvement loop (nightly review/synthesis)
- Multi-LLM routing logic (OpenClaw supports multiple models but doesn't have intelligent routing)
- Security hardening beyond defaults (the research shows 7,922 attacks in the wild)
- Your custom integrations (Attio, Granola, own apps)
- Modularity for sharing components publicly
- The Dennett-inspired architecture decisions

### Risks
- **Architecture mismatch**: OpenClaw is designed as a chat-first assistant. Cortex wants to be a task-processing system with chat as one interface. Fundamental difference.
- **Dependency on upstream**: If OpenClaw's maintainers make breaking changes or go a different direction, you're fighting the framework
- **VPS deployment pain**: Research confirmed Google OAuth on headless servers is a nightmare. This is a known, unresolved issue.
- **Mac-first bias**: Most success stories are local Mac deployments. Your needs are broader.
- **Security surface area**: Using someone else's framework means inheriting their security assumptions. The 10 attack vectors documented show this is real.

### Honest Assessment
You'd use maybe 30-40% of OpenClaw (messaging layer, basic plugin architecture) and rebuild 60-70% (memory, task queue, routing, security, self-improvement). At that point, the framework is overhead, not foundation.

---

## Option 2: Build From Scratch

### What You'd Have to Build
- Everything.
- Messaging integrations (Telegram, Slack, etc.)
- WebSocket/HTTP server
- Memory system
- Task queue
- Plugin/skill architecture
- Security sandbox
- Model routing
- All integrations

### What You'd Get
- **Perfect architecture fit**: Designed for YOUR use case from line 1
- **No upstream dependency**: You own every line
- **Security by design**: Not retrofitting security onto someone else's framework
- **Modularity by design**: Can be built for sharing from the start
- **Full control of the stack**: Choose your runtime, deployment, everything

### Risks
- **Massive scope**: This is a multi-month project to reach feature parity with what OpenClaw gives you in a day
- **Reinventing wheels**: Telegram bot integration, WebSocket handling, message parsing -- solved problems you'd be re-solving
- **Solo maintenance burden**: No community to help fix bugs or add features
- **Feature creep**: Without constraints, the architecture can grow endlessly before shipping anything useful

### Honest Assessment
You have the skills (data science + psychology + crypto research background suggests strong technical chops). But the time cost is real. Building messaging integrations alone is weeks of work for something that already exists.

---

## Option 3: Hybrid

### The Idea
Use OpenClaw strictly as the **messaging/channel layer** -- the part that connects to Telegram, Slack, WhatsApp. Build everything above that custom.

### Architecture Would Look Like
```
[Telegram] [Slack] [CLI] [VS Code]
     |        |       |       |
     ----- OpenClaw Gateway ----   <- Use OpenClaw here only
              |
         [Cortex Core]             <- Custom: routing, memory, queue, security
              |
    ---------------------
  [Agent] [Agent] [Agent] [Tools]  <- Custom: modular, sandboxed
```

### Pros
- Get messaging for free
- Build the interesting parts (memory, routing, self-improvement) yourself
- Clear separation: OpenClaw handles I/O, Cortex handles intelligence
- Can replace OpenClaw's gateway later without touching core

### Cons
- Still depends on OpenClaw for the gateway layer
- Two codebases to maintain
- Integration boundary between OpenClaw and Cortex core adds complexity
- OpenClaw's skill system may conflict with your own plugin architecture

### Honest Assessment
This is architecturally clean but practically awkward. You'd be using OpenClaw as a glorified message proxy. There are simpler ways to get Telegram/Slack bots running.

---

## Option 4: Claude Code Native

### The Idea
Don't build a framework at all. Use **Claude Code** as the runtime, **MCP servers** for integrations, **markdown files** for memory, and **skills/subagents** for modularity. This is essentially what you're already doing.

### Architecture
```
[Claude Code Desktop] [Claude Code CLI] [Telegram via MCP]
              |                |                |
              --------- Claude Code Runtime -----
                        |           |
                   [MCP Servers]  [Skills]
                   - Slack        - /morning
                   - GitHub       - /prep
                   - Calendar     - /process-meeting
                   - Attio        - /content-draft
                   - Custom       - /build-agent
                        |
                  [Markdown Files]
                  - /context/
                  - /actions/queue.md
                  - /memory/
```

### What You Get for Free
- **Already working**: This is literally what we're doing right now
- **No deployment needed**: Claude Code runs locally, connects to everything via MCP
- **Subagents built in**: Claude Code's Task tool already spawns subagents
- **Memory via files**: Markdown-based memory is already the system design
- **Skills system**: Claude Code skills are the plugin architecture
- **Multi-model possible**: Can route to different models via MCP or API calls
- **Security**: Claude Code's sandbox, plus MCP server permission model

### What You'd Need to Add
- **Telegram/WhatsApp interface**: Need an MCP server or bridge to receive messages when not at the terminal
- **Always-on capability**: Claude Code is session-based. Need something to handle messages when you're not in a session
- **Task queue persistence**: Between sessions, tasks need to survive. Markdown files handle this, but there's no "wake up and process queue" trigger
- **Proactive behavior**: Claude Code is reactive (you ask, it responds). For proactive alerts ("you have 3 overdue items"), you need a trigger mechanism
- **Self-improvement automation**: The nightly synthesis loop needs a scheduler

### The Gap: Always-On vs. Session-Based
This is the critical limitation. Claude Code is a tool you open and use. Cortex wants to be a system that's always running, processing, and reaching out. The gap is:

| Capability | Claude Code | Cortex Needs |
|---|---|---|
| Respond to user in terminal | Yes | Yes |
| Respond to Telegram message at 3am | No | Yes |
| Run nightly synthesis | No (needs cron trigger) | Yes |
| Alert user about overdue items | No (user must ask) | Yes |
| Process incoming webhooks | No | Yes |

### Bridging the Gap
The gap can be filled with a thin persistent layer:
1. **A small server** (Node/Python) that receives Telegram messages, webhooks, and cron triggers
2. This server **invokes Claude Code CLI** (or the Claude API directly) with context
3. Claude Code does the actual thinking/acting
4. Results flow back through the server to Telegram/Slack/etc.

This gives you always-on capability without building a full framework. The "brain" stays in Claude Code. The server is just plumbing.

---

## Comparison Matrix

| Factor | Fork OpenClaw | Build Scratch | Hybrid | Claude Code Native |
|---|---|---|---|---|
| Time to useful | Days | Months | Weeks | **Already working** |
| Architecture fit | Poor (chat-first) | Perfect | Good | Good (session gap) |
| Messaging channels | Great | Must build | Great | Must add thin layer |
| Memory system | Basic | Build yours | Build yours | **Already have it** |
| Security control | Inherits theirs | Full control | Mixed | Good (MCP model) |
| Modularity/sharing | Limited | Full control | Good | **Skills + MCP** |
| Multi-LLM routing | Basic | Full control | Full control | Via MCP/API |
| Self-improvement | Must build | Must build | Must build | Must add triggers |
| Always-on | Yes | Must build | Yes | **No -- needs bridge** |
| Maintenance burden | Medium (upstream) | High (solo) | High (two systems) | **Low** |
| Community/support | Active | None | Partial | Claude Code updates |
| Proactive behavior | Possible | Must build | Possible | **Needs triggers** |

---

## My Current Thinking

### The Case for Claude Code Native + Thin Bridge

The strongest option looks like **Option 4 with a thin persistent bridge**. Here's why:

1. **We're already here.** The markdown-based system, memory, context files, skills -- this IS Claude Code native. We're not evaluating hypotheticals. We're using it.

2. **The only real gap is always-on.** Everything else (memory, modularity, security, subagents, multi-model) either already works or is straightforward to add via MCP.

3. **The bridge is small.** A Node/Python server that:
   - Listens for Telegram messages
   - Runs on cron for nightly synthesis
   - Processes webhooks from integrations
   - Invokes Claude (API or CLI) with context from the markdown files
   - Sends responses back to channels

   This is maybe 200-500 lines of code. Not a framework.

4. **Modularity is native.** MCP servers ARE plugins. Skills ARE modules. Markdown files ARE the memory system. The architecture already matches what we want.

5. **Security separation is cleaner.** Each MCP server has scoped permissions. Skills run in context. The bridge server only has access to what you give it. This is better than OpenClaw's single-process model.

6. **Sharing is natural.** MCP servers, Claude Code skills, and prompt templates are already shareable formats. No need to design a custom plugin architecture.

7. **Multi-LLM is solvable.** The bridge can route to different models. Claude Code already supports model selection. MCP servers can wrap any API.

### What OpenClaw Would Add That We Don't Have
Honestly+ Just the **polished messaging layer** (Telegram, WhatsApp, iMessage support). And even that comes with baggage (VPS deployment pain, security surface area, Mac-first bias).

### What We'd Lose By Going OpenClaw
- The simplicity of the current system
- Full control over architecture
- Clean security boundaries
- The ability to evolve independently

---

## Open Questions (To Resolve Before Deciding)

1. **How important is Telegram/WhatsApp as an interface+** If it's critical and needed NOW, OpenClaw's messaging layer saves time. If it can wait, the thin bridge approach wins.

2. **What's the deployment target+** Local machine+ VPS+ Both+ This affects the always-on strategy.

3. **How much proactive behavior is needed+** If Cortex just needs to respond when asked, Claude Code native is fine. If it needs to reach out (alerts, reminders, nightly reports), the bridge becomes more important.

4. **Do you want to ship shareable modules soon+** If yes, building on Claude Code's MCP/skills ecosystem means you're building in a format others can use immediately.

5. **Local model hosting -- how important+** If you want local LLMs for cost/privacy, the bridge server can route to local models. But this is an architectural decision that affects the whole stack.

6. **What programming language for the bridge/runtime+** Need to evaluate:
   - Speed (low latency for message handling, fast cold starts)
   - Token efficiency (minimize tokens sent to LLMs -- compact serialization, smart context packing)
   - Ecosystem maturity for LLM tooling
   - Developer productivity (Cortex should be able to modify its own code)
   - See detailed analysis below.

7. **How does self-evolution actually work+** Cortex needs to:
   - Improve itself on command ("fix this", "optimize that workflow")
   - Suggest new features based on usage patterns (proactive, not just reactive)
   - Debug and fix its own bugs (detect failures, diagnose, patch, test)
   - This requires Cortex to have read/write access to its own codebase with safety rails

---

## Language & Framework Evaluation (TODO: Research Required)

This is a critical decision. The bridge/runtime layer needs to be **fast** and **token-efficient**. We need to research and benchmark before choosing.

### Criteria (Ranked by Priority)

| Priority | Criterion | Why |
|---|---|---|
| 1 | **Token efficiency** | Every token sent to an LLM costs money and latency. The runtime must minimize context overhead -- compact message formats, smart truncation, efficient serialization |
| 2 | **Speed / low latency** | Message handling, webhook processing, model invocation should be sub-second. Cold starts matter for serverless/cron triggers |
| 3 | **LLM ecosystem** | SDKs, MCP libraries, streaming support, tool-use implementations. A language with mature LLM tooling saves months |
| 4 | **Self-modifiability** | Cortex will edit its own code. Interpreted languages are easier to hot-reload. Compiled languages need build steps |
| 5 | **Deployment simplicity** | Single binary vs. dependency management. Docker-friendly. Low resource footprint |
| 6 | **Community & hiring** | If we open-source modules, the language affects adoption |

### Candidates to Evaluate

| Language | Speed | Token Efficiency | LLM Ecosystem | Self-Modify | Deploy | Notes |
|---|---|---|---|---|---|---|
| **TypeScript/Node** | Good (V8) | Good (JSON native) | Excellent (Anthropic SDK, Vercel AI, MCP ref impl) | Hot reload possible | npm/Docker | OpenClaw is Node. MCP reference implementation is TS. Anthropic SDK is first-class. Probably the default choice |
| **Python** | Slow | Good (JSON native) | Excellent (anthropic, langchain, litellm, instructor) | Easy (interpreted) | pip/Docker | Most LLM tooling is Python-first. But slower runtime, heavier footprint |
| **Rust** | Fastest | Best (zero-copy, compact) | Growing (misanthropic, mcp-rs) | Hard (compiled) | Single binary | Best performance but hardest to self-modify. Good for stable infrastructure components |
| **Go** | Fast | Good | Growing (anthropic-go, langchaingo) | Hard (compiled) | Single binary | Fast, simple deployment, but LLM ecosystem is behind TS/Python |
| **Bun** | Very fast | Good | Good (TS compat) | Hot reload | Single binary-ish | Faster than Node, TS-compatible, but younger ecosystem |

### Initial Leaning
**TypeScript (Bun or Node)** seems like the sweet spot:
- MCP reference implementation is TypeScript
- Anthropic SDK is first-class TypeScript
- Claude Code itself is TypeScript
- JSON is native (no serialization overhead for LLM communication)
- Self-modifiable (interpreted-ish via transpilation)
- Cortex can write/edit its own TS code
- Bun gives speed gains over Node if needed

**But this needs real benchmarking.** Specifically:
- Token overhead comparison: How much context does each language's SDK/tooling consume+
- Cold start times: For cron-triggered tasks, how fast can each language spin up+
- Memory footprint: For always-on bridge, what's the baseline RAM usage+
- MCP server implementation: Which languages have the most mature MCP server libraries+

*TODO: Research session needed on language benchmarks for LLM agent runtimes.*

---

## Interface Problem: Where Do I Input Commands+

This is an unsolved design question. Currently Cortex lives inside Claude Code sessions. But the system needs to be reachable from more places.

### Requirements
- Need to input commands, quick notes, and tasks from anywhere (phone, laptop, desk, on the go)
- Need to see status and responses
- Must be secure -- especially if the interface is accessible outside the local machine

### Options to Evaluate

| Interface | Pros | Cons | Security |
|---|---|---|---|
| **Claude Code CLI** | Already working, full power | Desktop only, session-based | Local -- safe |
| **Telegram bot** | Mobile, always accessible, already use it for sales | Needs bridge server, messages go through Telegram servers | Medium -- Telegram stores messages |
| **Custom web UI** | Full control, can design for Cortex's needs, mobile browser | Must build it, must host and secure it | Must solve auth |
| **Simple mobile note queue** | Lowest friction -- just a text box that feeds into `/actions/queue.md` | One-directional (input only), no responses | Easy to secure (append-only) |
| **VS Code extension** | Natural for coding workflow | Desktop only, limited to code context | Local -- safe |
| **Obsidian / markdown editor** | Cortex already uses markdown files, could watch for changes | No response mechanism, passive | Local -- safe |

### Resolved: Slack as Command Interface, Telegram as Data Source

**Decision made** -- see `decisions/2026-02-02-blocking-decisions.md` for full details.

- **Slack `#cortex` channel** = command interface (mobile + desktop, controlled workspace, not lost in chat noise)
- **Telegram** = read-only data source (sales/relationship monitoring, never takes commands)
- **Claude Code CLI** = primary power interface (local, session-based)

Phase 1: CLI (now). Phase 2: Slack queue bot. Phase 3: Slack bot with LLM responses. Telegram listener runs separately as a read-only contact context extractor.

### Key Principle
**Compute stays local. External interfaces are just input/output pipes.** This keeps secrets safe, avoids prompt injection from external sources, and means the "brain" is always under your control.

---

## LLM Routing & Local Models Problem

How do we run models locally, who decides when to switch, and how do we measure performance+

### The Routing Decision
Not all tasks need the same model. The system needs intelligent routing:

| Task Type | Ideal Model | Why |
|---|---|---|
| Quick capture / filing | Local small model or Haiku | Fast, cheap, low intelligence needed |
| Meeting summary | Claude Sonnet | Good balance of speed and quality |
| Complex architecture decisions | Claude Opus / o3 | Maximum reasoning |
| Code generation | Claude Sonnet or Codex | Code-specialized |
| Content drafting | Claude Sonnet | Creative + fast |
| Security audit / pen testing | Opus | Needs deep reasoning about attack vectors |
| Bulk operations (renaming, formatting) | Local model | Free, fast, doesn't need cloud |

### Open Questions
1. **Where do local models run+** Ollama+ LM Studio+ vLLM+ What hardware is available+
2. **Routing logic -- who decides+** Options:
   - Static rules (task type -> model mapping, configured in SYSTEM.md)
   - Dynamic router (a small model classifies the task, then routes to the right model)
   - User override (default routing, but I can say "use Opus for this")
3. **Performance measurement**: Track per-task metrics:
   - Latency (time to first token, time to completion)
   - Token usage (input + output)
   - Task success rate (did the output actually work+)
   - Cost per task
   - Store in `/context/model-performance.md`, use to tune routing over time
4. **Model switching should be a Cortex self-improvement feature**: As performance data accumulates, Cortex should suggest routing changes. "Haiku fails on meeting summaries 30% of the time. Recommend switching to Sonnet for that task type."

---

## Security Architecture -- Deep Dive

This is a design priority, not an afterthought. The system handles secrets, personal data, business intel, and acts in the real world.

### Threat Model for Cortex

| Threat | Risk | Mitigation |
|---|---|---|
| **Prompt injection via scraped content** | Malicious instructions in web pages, emails, documents | Input validation layer, never execute instructions from external sources without human approval |
| **API key leakage** | Keys end up in prompts, logs, or shared context | Credential isolation (env vars / secrets manager), never in markdown files or agent prompts |
| **Sensitive info in shared modules** | Publishing a module that contains personal data | Automated scrub check before any module is shared. Cortex audits for PII/keys before publish |
| **Unintended public actions** | Posting content, sending messages without approval | **Human in the loop for ALL public-facing actions**. Draft -> approve -> execute. No exceptions |
| **Subagent privilege escalation** | A content drafting agent accessing CRM or sales data | Sandboxed execution, least privilege, trust boundaries enforced at module level |
| **Session hijacking** | If external interface (Telegram/web) is compromised, attacker controls Cortex | Auth on all external interfaces, rate limiting, anomaly detection, critical actions require local confirmation |
| **Memory poisoning** | Bad data in memory files corrupts Cortex's behavior over time | Periodic memory audits, versioned memory, ability to roll back to known-good state |
| **Supply chain** | Malicious MCP server or community module | Code review before installing any external module, sandboxed execution, no core access for community modules |

### Design Principles
1. **Human in the loop for public actions**: Sending messages, posting content, modifying shared resources -- always require explicit approval
2. **Secrets never in context**: API keys, tokens, passwords live in env vars or a secrets manager. Never in markdown, never in prompts, never in memory files
3. **Input validation on all external data**: Webhooks, scraped content, Telegram messages, email -- all untrusted. Sanitize before processing
4. **Audit trail**: Log every external action with timestamp, agent, and outcome. Stored in `/context/audit.md`
5. **Principle of least privilege**: Each module gets only what it needs. Read-only where possible
6. **Graceful degradation**: If a security check fails, Cortex stops and asks rather than proceeding with reduced security

---

## Preliminary Recommendation

**Start with Claude Code native. Build the thin bridge when always-on becomes necessary. Don't adopt OpenClaw.**

Rationale:
- We're already productive in this architecture
- The bridge is a small, well-scoped project
- OpenClaw's benefits don't justify its costs for our use case
- Modularity, security, and sharing are better served by MCP/skills
- The Dennett-inspired principles (distributed processing, narrative memory, background-first) map directly to Claude Code + markdown + MCP

This doesn't close the door on OpenClaw. If the bridge becomes too complex or the messaging layer becomes urgent, we can evaluate again. But the default path should be extending what works, not adopting a framework that doesn't fit.

---

*This document is a brainstorm, not a final decision. Update when new information or constraints emerge.*
