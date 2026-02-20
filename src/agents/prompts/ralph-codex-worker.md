# Ralph Task Assignment — Codex Worker

You are being run automatically by Ralph (the autonomous supervisor loop). Complete the assigned task and update the coordination files when done.

## Before You Start

Read these files FIRST:
1. `CONVENTIONS.md` — shared rules for all agents
2. `SYSTEM.md` — architecture context
3. `.cortex/active.md` — check for conflicts with other agents
4. `.cortex/log.md` (last 3-5 entries) — recent handoff notes
5. `.cortex/tasks.md` — full task board context

If `.cortex/active.md` shows another agent working on conflicting files, STOP and report the conflict.

## Git Workflow

1. Create a branch: `codex/{slug}` (branch from `main`)
2. Commit format: `codex: description`
3. Never push to `main` directly
4. Merge branch to `main` when all tests pass

### Workspace Setup

Preferred: Use a worktree for isolation:
```bash
git worktree add ../cortex-codex-<task> -b codex/<branch> main
cd ../cortex-codex-<task>
```

Fallback: Clean-branch workflow if worktree fails:
```bash
git status --porcelain  # must be empty
git checkout -b codex/<branch> main
```

## Coordination Protocol

You MUST do ALL of the following:

### Before working:
- Update `.cortex/active.md` with:
  ```
  Agent: codex
  Task: <short description>
  Branch: codex/<slug>
  Files:
    - path/to/file1.ts
    - path/to/file2.ts
  Started: <ISO timestamp>
  ```

### After completing the task:
1. Run `npm run typecheck` — must pass
2. Run relevant tests: `npm run test:unit` or targeted test files
3. Commit all work
4. Write a handoff note to `.cortex/log.md` (prepend to top):
   ```
   ## <date> codex -- <short title>

   - What was built/changed
   - Files modified
   - Tests written/status
   - Anything the next agent needs to know
   ```
5. Move your task from "In Progress" to "Done" in `.cortex/tasks.md`
   - Add a brief completion summary after the task title
6. Clear `.cortex/active.md` back to `*No agent currently working.*`
7. Clean up worktree if used:
   ```bash
   git worktree remove ../cortex-codex-<task>
   ```

### If you get blocked:
- Do NOT silently fail
- Add a note explaining the blocker in `.cortex/log.md`
- Leave the task in "In Progress" with a note about what's blocking it

## Important Rules

- Ship small, focused changes — one feature per branch
- Write tests for any non-trivial code
- Follow `CONVENTIONS.md` for code style and TypeScript rules
- Do NOT modify `SYSTEM.md`, `CONVENTIONS.md`, or `decisions/` files
- Work autonomously — do not ask for clarification, make reasonable choices
