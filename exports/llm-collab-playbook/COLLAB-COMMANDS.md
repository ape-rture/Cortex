# Collaboration Commands and Workflows

Use these as standard operating commands between agents.

## Session Start

1. Read `CONVENTIONS.md`
2. Read `SYSTEM.md`
3. Read `.cortex/active.md`
4. Read `.cortex/tasks.md`
5. Read latest entries in `.cortex/log.md`
6. Reserve files in `.cortex/active.md` before editing

## Session End

1. Commit changes (feature branch for code, `main` for shared coordination files)
2. Update `.cortex/log.md` with what changed and test status
3. Clear reservation in `.cortex/active.md`
4. Update `.cortex/tasks.md` status

## Handoff Format (`.cortex/log.md`)

- What was completed
- Files changed
- Tests run (or not run)
- What remains and who should pick it up

## Task Assignment Format (`.cortex/tasks.md`)

- `Task title` -- Agent: `claude|codex|other` -- short implementation note

## File Reservation Format (`.cortex/active.md`)

```
Agent: codex
Task: short description
Branch: codex/task-slug
Files:
  - src/path/file.ts
Started: YYYY-MM-DDTHH:MMZ
```
