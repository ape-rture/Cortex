# Decision: Adopt Takopi Patterns for Orchestrator & Interface Layer

**Date**: 2026-02-04
**Status**: decided
**Deciders**: Dennis, Claude Code

## Context

Research into [Takopi](https://github.com/banteg/takopi) (a Telegram bot bridge for AI coding agents by banteg) revealed five architectural patterns that map directly to Cortex's planned Phase 5 orchestrator and Phase 7 interface layer. See `research/12-takopi-telegram-bridge.md` for the full analysis.

Cortex already had plans for an orchestrator (Dennett architecture), multi-interface support (Slack + Telegram), and task queue concurrency. Takopi provides proven, working implementations of these patterns that can serve as reference designs.

## What We're Adopting

### 1. Normalized Event Model (Phase 5, P0)
Takopi normalizes all engine outputs into `StartedEvent`, `ActionEvent`, `CompletedEvent`. We adopt this as a streaming event layer that wraps our existing `AgentOutput` type.

- **New file**: `src/core/types/events.ts`
- **Integration**: `OrchestratorCycle.events`, `Orchestrator.onEvent()`
- **Use case**: Real-time progress streaming to transports

### 2. Agent AutoRouter (Phase 5, P1)
Takopi routes messages to engines via cascade: explicit directive > topic default > chat default > project default > global default. We adopt this as an agent dispatch layer above our existing `ConfigRouter`.

- **Extended**: `src/core/types/routing.ts` (AgentAffinity, AgentRouteConfig, AgentRouter)
- **Config**: `context/model-routing.json` gets `agent_routing` section
- **Relationship**: AgentRouter selects agent, ConfigRouter selects model for that agent

### 3. Resume Tokens (Phase 5, P1)
Takopi includes a resume token in every response for stateless session continuity. We adopt this as a lightweight complement to our existing `SessionSnapshot`.

- **Extended**: `src/core/types/session.ts` (ResumeToken, ResumeTokenStore)
- **Storage**: `.cortex/resume-tokens.json`
- **Benefit**: Cross-interface continuity (start in Slack, continue in CLI)

### 4. ThreadScheduler (Phase 5, P1)
Takopi's per-thread FIFO with cross-thread parallelism. We adopt this as a concurrency layer composing around our existing `TaskQueue`.

- **Extended**: `src/core/types/task-queue.ts` (ThreadKey, ThreadScheduler)
- **Relationship**: ThreadScheduler groups tasks by context, serializes within, parallelizes across

### 5. Telegram as Bidirectional Interface (Phase 7, P1)
Takopi proves Telegram can be a full command interface. We upgrade our plan from "read-only data source" to bidirectional, using Takopi as reference.

- **Updated**: `projects/feature-roadmap.md` Phase 7
- **Previous plan**: Telegram was read-only listener (P2)
- **New plan**: Bidirectional command interface (P1), with sales tracking as read-only layer on top

## What We're NOT Adopting

| Pattern | Reason |
|---|---|
| **Python runtime** | Cortex is TypeScript/Node.js (decided 2026-02-02) |
| **Telegram-first design** | Slack remains primary command interface; Telegram is added in Phase 7 |
| **Whisper voice transcription** | Not a priority; can add later if needed |
| **Git worktree management** | Cortex uses simpler branch model via `.cortex/active.md` |
| **JSONL subprocess protocol** | May adopt later; for now agents are API calls not CLI subprocesses |
| **Forum topic mapping** | Specific to Telegram's forum feature; not needed initially |

## Consequences

1. All Phase 5 orchestrator types now include event streaming, agent routing, resume tokens, and thread scheduling
2. Phase 7 scope expands: Telegram upgraded from read-only to bidirectional
3. Phase 8 gains plugin architecture inspiration from Takopi's entrypoints model
4. Type definitions are committed now; Codex implements when Phase 5 starts
5. The `context/model-routing.json` schema gains an `agent_routing` section (documented in `context/model-routing-spec.md`)

## Review Date

When Phase 5 implementation begins -- validate that the type definitions match implementation needs.

---

*Research: `research/12-takopi-telegram-bridge.md`*
*Architecture: `decisions/2026-02-02-dennett-architecture.md`*
*Roadmap: `projects/feature-roadmap.md`*
