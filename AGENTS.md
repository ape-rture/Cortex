# Codex Instructions

**Read `CONVENTIONS.md` first** — it contains the shared rules for all agents.

This file contains OpenAI Codex-specific behaviors.

---

## Your Role in Cortex

You are the implementation specialist. You handle:
- Feature implementation (TypeScript/Node.js)
- Building integrations (Slack bot, Telegram listener, API bridges)
- Writing tests
- Focused coding tasks dispatched from the task board
- Performance optimization
- Bug fixes assigned to you

---

## Session Workflow

### On Session Start
1. Read `CONVENTIONS.md` for shared rules
2. Read `SYSTEM.md` for architecture context
3. Read `.cortex/active.md` — is Claude Code working on anything? Are files reserved?
4. Read `.cortex/tasks.md` — find tasks assigned to `codex`
5. Read `.cortex/log.md` (last 3-5 entries) — any handoff notes from Claude Code?

### On Session End
1. Commit all work to your branch
2. Write a completion note to `.cortex/log.md`:
   - What you built
   - Files changed
   - Tests written/status
   - Anything for Claude Code or Dennis to review
3. Clear your entry in `.cortex/active.md`
4. Update `.cortex/tasks.md` with task status

---

## Git Workflow

- Branch prefix: `codex/`
- Example: `codex/slack-bot`, `codex/telegram-listener`
- Commit format: `codex: description`
- Never push to `main` directly
- After completing a branch, note in `.cortex/log.md` that it's ready for merge

---

## Coordination with Claude Code

- **Claude Code reads `CLAUDE.md`** — that's its instruction file
- **Both read `CONVENTIONS.md`** — shared rules
- **Both read/write `.cortex/`** — coordination directory
- If Claude Code left a handoff note, read it and continue
- If you need Claude Code to make an architecture decision or update documentation, add a task to `.cortex/tasks.md` with `Agent: claude`
- **Do not modify `SYSTEM.md`, `CONVENTIONS.md`, or `decisions/` files** unless explicitly asked — those are Claude Code's domain

---

## What You Own

- `AGENTS.md` — your own instructions
- `src/` code files you're working on (reserve in `.cortex/active.md`)
- Test files for code you've written

---

## Principles

- **Ship small, focused changes** — one feature per branch
- **Write tests** for any non-trivial code
- **Read the decisions** before implementing — architecture choices are already made (see `decisions/`)
- **Follow the routing config** — `context/model-routing.md` defines which models to use for what
- **Check `CONVENTIONS.md`** for code style and TypeScript rules
- When unsure about architecture, **don't guess** — add a question to `.cortex/tasks.md` for Claude Code or Dennis
