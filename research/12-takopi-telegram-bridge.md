# Takopi — Telegram Bridge for AI Coding Agents

**Date**: 2026-02-04
**Source**: https://github.com/banteg/takopi
**Relevance**: Mobile command interface, multi-engine routing, resume tokens, event normalization

---

## What is Takopi?

Takopi is a Telegram bot bridge by banteg that lets you control AI coding agents (Claude Code, OpenAI Codex, OpenCode, Pi) from your phone via Telegram. You send messages to a Telegram bot, it spawns the agent CLI as a subprocess, streams progress back in real-time, and lets you resume conversations later — either in Telegram or at a terminal.

- **Author**: banteg (MIT License)
- **Language**: Python 3.14+, installed via `uv`
- **Version**: 0.21.4 (as of 2026-01-22)

---

## Core Architecture

### Layers

1. **CLI Layer** — Typer-based CLI with config, doctor, init, onboarding, and plugin subcommands
2. **Plugin System** — Python entrypoints for lazy discovery of engine backends, transport backends, and command backends
3. **AutoRouter** — Routes messages to the correct engine based on: explicit `/engine` directive > topic default > chat default > project default > global default
4. **ThreadScheduler** — Per-thread FIFO job queue. Different threads run in parallel; same-thread runs are serialized
5. **Runner Layer** — Each runner wraps an agent CLI (`claude`, `codex`, `opencode`, `pi`), spawns it as a subprocess, reads JSONL stdout, and translates events into a normalized model
6. **Bridge Layer** — Transport-agnostic execution orchestrator. Receives message, spawns runner, streams events, publishes final answer with resume token
7. **Telegram Transport** — Polling loop, slash commands, markdown rendering, voice transcription, file transfer, forum topics, chat sessions

### Normalized Event Model

All engine outputs are translated into three event types:

- **StartedEvent** — engine, resume token, title, metadata
- **ActionEvent** — engine, action (kind: command | tool | file_change | web_search | subagent | note), phase (started | updated | completed)
- **CompletedEvent** — engine, ok/error, answer text, resume token, usage stats

### Resume Tokens

Every response includes a resume line (e.g., `` `claude --resume abc123` ``). Reply in Telegram to continue, or paste in terminal. Fully stateless — no server-side session storage needed.

---

## Key Features

| Feature | Description |
|---|---|
| Multi-engine support | `/claude`, `/codex`, `/opencode`, `/pi` to pick which agent handles a request |
| Projects & worktrees | Register repos with `takopi init <alias>`, target from Telegram, auto-create git worktrees per branch |
| Stateless resume | Every response includes a resume token for continuing in Telegram or terminal |
| Real-time streaming | Progress messages show running tools, file changes, elapsed time via message edits |
| Per-thread serialization | Parallel across conversations, serial within one — prevents race conditions |
| Voice notes | Transcribes voice messages via Whisper, routes as text |
| File transfer | Send files to/from the project repo through Telegram |
| Forum topics | Map Telegram forum topics to specific project/branch contexts |
| Chat sessions | Auto-resume mode per chat without replying to previous messages |
| Config hot-reload | Watches TOML config, applies changes without restart |
| Plugin system | Extend with custom engines, transports, and commands via Python entrypoints |

---

## Features Interesting for Cortex

### 1. Telegram as a Mobile Command Interface (High value)

Cortex lists Telegram as an integration but only for "read-only data source." Takopi proves Telegram can be a full bidirectional command interface — send tasks, get streaming progress, resume conversations. This would let you interact with Cortex from your phone with the same power as the terminal. Given that Slack is already the command interface, Telegram could serve as the mobile-first alternative.

### 2. Stateless Resume Tokens (High value)

Every Takopi response includes a resume line like `` `claude --resume abc123` ``. This maps directly to Cortex's "warm handoff between sessions" problem. Instead of relying on `.cortex/log.md` handoff notes alone, a resume token system would let any agent (Claude Code or Codex) pick up exactly where the previous session left off — in terminal, in Slack, or in Telegram. Mechanical continuity rather than prose-based context reconstruction.

### 3. AutoRouter / Engine Selection (High value)

Takopi's AutoRouter selects which engine handles a message based on: explicit directive > topic default > chat default > project default > global default. Cortex already has Claude Code and Codex with different strengths (design vs backend). An auto-router could intelligently dispatch tasks — frontend/design to Claude, backend/data to Codex — based on task type, project config, or explicit user directive. This aligns directly with Cortex's existing `context/model-routing.json`.

### 4. ThreadScheduler Pattern (Medium value)

Per-thread FIFO with cross-thread parallelism is the concurrency model Cortex needs for its task queue (`/actions/queue.md`). Multiple projects can run in parallel, but tasks within one project are serialized. This prevents race conditions on `.cortex/active.md` and shared files.

### 5. Normalized Event Model (Medium value)

Takopi normalizes all engine outputs into StartedEvent, ActionEvent, CompletedEvent. Cortex could adopt this for its orchestrator layer — regardless of which agent is running, the orchestrator and salience scorer see the same event format. This is the "standard interfaces" principle from CONVENTIONS.md and a prerequisite for the Dennett-inspired architecture (distributed agents broadcasting to a global workspace).

### 6. Real-time Progress Streaming (Medium value)

Streaming agent progress to Slack or Telegram (what tool is running, elapsed time, file changes) would give visibility into what Cortex is doing during background tasks. Currently there's no live feedback when agents work asynchronously. Useful for the "fame threshold" concept — progress events are the raw feed, salience scoring decides what surfaces to the user.

### 8. Plugin Architecture via Entrypoints (Design inspiration)

Takopi's plugin system (engines, transports, commands as Python entrypoints) is a clean model for Cortex's modularity goals. New integrations, agents, or command handlers could be added without modifying core code. Aligns with the "plugin-style architecture" principle in SYSTEM.md.

---

## Recommended Priority for Cortex

1. **AutoRouter for Claude/Codex dispatching** — Direct architectural fit with existing multi-agent setup and `context/model-routing.json`
2. **Resume tokens** — Solves the warm handoff problem mechanically rather than via prose notes in `.cortex/log.md`
3. **Normalized event model** — Prerequisite for the orchestrator/salience scorer architecture described in SYSTEM.md
4. **Telegram as mobile command interface** — High user value; Takopi is essentially a reference implementation
5. **ThreadScheduler for task queue** — Solves concurrency for `/actions/queue.md`

---

## Implementation Notes

- Takopi is Python 3.14+ / MIT licensed — could fork components or use as reference
- The JSONL subprocess runner pattern is language-agnostic; Cortex's TypeScript runtime could adopt the same approach
- The normalized event model is small and self-contained — good first thing to implement as a shared type in `src/core/types/`
- AutoRouter logic is ~200 lines and clean — worth reading as a reference for Cortex's routing layer
