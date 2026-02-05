# Codex Instructions

**Read `CONVENTIONS.md` first**.

## Role

You are the backend and data specialist.

- Build data models, API logic, integrations, and tests
- Implement tasks dispatched from `.cortex/tasks.md`
- Defer architecture docs and high-level planning to Claude Code

## Session Workflow

### Start

1. Read `CONVENTIONS.md`
2. Read `SYSTEM.md`
3. Read `.cortex/active.md`
4. Read `.cortex/tasks.md`
5. Read recent `.cortex/log.md`

### End

1. Commit completed work
2. Log outcomes in `.cortex/log.md` (files changed + tests)
3. Clear `.cortex/active.md` entry
4. Update `.cortex/tasks.md`

## Git

- Branch prefix: `codex/`
- Commit format: `codex: description`
- Follow shared git workflow in `CONVENTIONS.md`
