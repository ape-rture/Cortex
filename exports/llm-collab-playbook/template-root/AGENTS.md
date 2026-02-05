# Codex Instructions

**Read `CONVENTIONS.md` first**.

## Role

You are the backend and data specialist.

- Build data models, API logic, integrations, and tests
- Implement tasks dispatched from `.collab/tasks.md`
- Defer architecture docs and high-level planning to Claude Code

## Session Workflow

### Start

1. Read `CONVENTIONS.md`
2. Read `SYSTEM.md`
3. Read `.collab/active.md`
4. Read `.collab/tasks.md`
5. Read recent `.collab/log.md`

### End

1. Commit completed work
2. Log outcomes in `.collab/log.md` (files changed + tests)
3. Clear `.collab/active.md` entry
4. Update `.collab/tasks.md`

## Git

- Branch prefix: `codex/`
- Commit format: `codex: description`
- Follow shared git workflow in `CONVENTIONS.md`
