# Cortex -- Shared Development Conventions

**This file is read by ALL AI agents working on Cortex (Claude Code, OpenAI Codex, and any future agents). It is the single source of truth for how we build together.**

---

## Project Overview

**Cortex** is a personal AI assistant system for Dennis Verstappen, Head of Research at The Indexing Company.

- **Architecture**: Markdown-based memory + TypeScript/Node.js runtime + MCP integrations
- **System design**: See `SYSTEM.md`
- **Decisions**: See `decisions/` folder
- **Feature roadmap**: See `projects/feature-roadmap.md`
- **Model routing**: Canonical config is `context/model-routing.json` (summary in `context/model-routing.md`)

Read these files before making architectural decisions. If a decision has already been made in `decisions/`, follow it.

---

## Code Style

### TypeScript
- Strict mode (`"strict": true` in tsconfig)
- ESM modules (`"type": "module"` in package.json)
- Use `const` by default, `let` when mutation is needed, never `var`
- Prefer `async/await` over raw promises
- Explicit return types on exported functions
- Name files in kebab-case: `task-queue.ts`, `slack-bot.ts`
- Name classes in PascalCase, functions/variables in camelCase
- No `any` -- use `unknown` and narrow with type guards

### File Organization
```
/src/              -> TypeScript source code
  /core/           -> Core system (routing, memory, task queue)
  /integrations/   -> External service connectors (Slack, Attio, etc.)
  /agents/         -> Subagent definitions and configs
  /utils/          -> Shared utilities
/context/          -> Markdown memory files (NOT code)
/actions/          -> Task tracking (NOT code)
/research/         -> Research notes (NOT code)
/decisions/        -> Decision logs (NOT code)
```

### Markdown Files
- Markdown files in `/context/`, `/actions/`, `/decisions/`, `/research/`, `/projects/`, `/team/`, `/contacts/`, `/meetings/`, `/daily/` are **data, not code**
- Do NOT auto-format, lint, or restructure these files beyond what the task requires
- Preserve existing structure and formatting

---

## Git Conventions

### Two-Track Commit Model

The repo has two kinds of files with different git workflows:

**Track 1 -- Shared files: commit directly to `main`.**
These files are written by multiple agents and must always be in sync. Never put them on a feature branch.
- `.cortex/*` (active.md, log.md, tasks.md, snapshot.md)
- `CONVENTIONS.md`, `SYSTEM.md`, `CLAUDE.md`, `AGENTS.md`
- `context/*.md`, `decisions/*.md`, `projects/*.md`
- `actions/*.md`, `daily/*.md`
- `src/core/types/*` (shared contracts)
- `src/agents/prompts/*` (shared prompt specs)

**Track 2 -- Feature code: use branches, then merge.**
These files are implementation code that may break things. Branch, test, merge.
- `src/core/*.ts` (excluding `types/`)
- `src/integrations/*`
- `src/cli/*`
- `src/utils/*`
- `src/ui/*`
- Test files (`*.test.ts`)
- `package.json`, `tsconfig.json`, config scripts

### Workflow

1. **Shared file edits** -- commit to `main` immediately. No branch needed. These are coordination files; blocking them behind branches causes stalls.
2. **Feature code** -- create a branch (`claude/[slug]` or `codex/[slug]`), implement, test, merge to main, delete branch.
3. **Mixed changes** -- commit shared files to `main` first, then create branch for feature code. Never put shared files on a feature branch.

### Branches
- `claude/[task-slug]` -- branches created by Claude Code
- `codex/[task-slug]` -- branches created by OpenAI Codex
- `dennis/[task-slug]` -- branches created by Dennis manually

### Commits
Format: `[agent]: description`

```
claude: add task queue processing to core
codex: implement Slack webhook handler
claude: update task board with new Codex tasks
dennis: update SYSTEM.md with new requirements
```

- Keep commits focused -- one logical change per commit
- Write in imperative mood: "add", "fix", "update", not "added", "fixed", "updated"

### Merging
- **Agents merge their own branches to main autonomously** -- no human approval needed for merging
- Run tests before merging. If tests fail, fix first
- Merge with `git checkout main && git merge [branch] --no-ff` (preserve branch history)
- After merging: delete the branch, update `.cortex/log.md`
- If there are merge conflicts, resolve them if straightforward. Surface to Dennis only if the conflict involves a design decision

### Workspace Isolation

**Branch discipline:**
- Each agent works on their own branch only (`claude/`, `codex/`, etc.)
- Never edit files on another agent's branch
- Never switch branches with uncommitted changes in the working tree

**Concurrent work — use separate worktrees:**
- If two agents need to work simultaneously in the same repo, use separate git worktrees rather than sharing one working tree:
  ```
  git worktree add ../project-claude claude/layout
  git worktree add ../project-codex codex/db-schema
  ```
- Each agent operates exclusively in their own worktree directory
- The agent that creates the worktree is responsible for cleaning it up when done: `git worktree remove <path>`

**Shared files:**
- `.cortex/` files are always safe for any agent to read and write — that's their purpose
- `package.json`, lock files, and config files: one agent at a time — reserve via `.cortex/active.md` before editing

### What Dennis Never Needs To Do
- Dennis does NOT merge branches -- agents handle this
- Dennis does NOT resolve git conflicts -- agents handle this or escalate
- Dennis does NOT approve commits -- agents commit and merge autonomously
- Dennis reviews work via `.cortex/log.md` and the code itself, not via git workflow

---

## Coordination Protocol

### Before Starting Any Task

1. **Read `.cortex/active.md`** -- check if another agent is working and what files they've reserved
2. **Read `.cortex/tasks.md`** -- find your assigned task
3. **Update `.cortex/active.md`** -- register yourself, your task, and the files you'll touch (commit to main)
4. **If the task involves feature code**: create a branch (`claude/[slug]` or `codex/[slug]`)
5. **If the task is shared-files only** (docs, types, prompts, coordination): stay on `main`

### File Reservation Format

When reserving files in `.cortex/active.md`, use this format:

```
## Currently Active

Agent: claude
Task: implementing alias system types
Files:
  - context/aliases.md
  - src/core/types/index.ts
  - src/core/types/alias.ts
Started: 2026-02-03T14:00Z
```

**Be specific about file paths.** Vague reservations like "working on types" don't help other agents know what to avoid.

### Handling Unexpected Changes

If you see local changes in files you didn't modify:

1. **Check `.cortex/active.md`** -- is another agent working on those files?
2. **Check `.cortex/log.md`** (last 3-5 entries) -- did another agent log work on those files recently?
3. **If yes to either**: assume the other agent made the changes. Work around those files or wait.
4. **If no reservation AND no recent log entry**: ask Dennis how to proceed.

**Proceed-if-unrelated rule:** If dirty files exist but are clearly unrelated to your task and outside your ownership area (see File Ownership Rules), proceed without stopping. Do not stash, reset, or modify files owned by another agent. Example: if Claude is working on UI layout and Codex sees dirty `src/ui/` files, Codex ignores them and continues with its backend task.

### While Working

- Feature code: stay on your branch
- Shared files: commit to `main` as you go
- If you need a file another agent has reserved: STOP, note the dependency in `active.md`, and move to a different task

### When Finishing a Task

1. **Commit your work** with proper commit message format
2. **If on a branch**: run tests, merge to main, delete branch
3. **Update `.cortex/active.md`** -- clear your entry, unreserve files (commit to main)
4. **Append to `.cortex/log.md`** -- what you did, files changed, what to pick up next (commit to main)
5. **Update `.cortex/tasks.md`** -- move task from "In Progress" to "Done" (commit to main)

### Handoff Between Agents

When one agent finishes work that another agent should continue:
1. Finishing agent writes a handoff note in `.cortex/log.md` with:
   - What was completed
   - What remains
   - Any context the next agent needs
   - Which files are relevant
2. Finishing agent adds a task to `.cortex/tasks.md` assigned to the other agent
3. The next agent picks it up on their next session
4. All handoff updates are committed to `main` immediately

---

## File Ownership Rules

Some files should generally be owned by one agent to prevent conflicts:

| File/Folder | Primary Owner | Notes |
|---|---|---|
| `SYSTEM.md` | Claude Code | System design and architecture |
| `CONVENTIONS.md` | Claude Code | Shared conventions (coordinate changes) |
| `CLAUDE.md` | Claude Code | Claude-specific instructions |
| `AGENTS.md` | Codex | Codex-specific instructions |
| `context/*.md` | Claude Code | Memory and context files |
| `decisions/*.md` | Claude Code | Decision logs |
| `src/core/` | Codex (primary) | Core runtime, data models, backend logic |
| `src/integrations/` | Codex (primary) | Integration modules (Slack, Attio, etc.) |
| `src/agents/` | Claude Code (prompts), Codex (runtime) | Claude designs prompts, Codex builds execution |
| `src/ui/` | Claude Code | Frontend components, UI/UX |
| `.cortex/active.md` | Both | Coordination file -- both read AND write |
| `.cortex/log.md` | Both | Activity log -- both append |
| `.cortex/tasks.md` | Both | Task board -- both read and update |

**These are defaults, not hard rules.** Either agent can touch any file if they reserve it in `.cortex/active.md` first and the other agent hasn't reserved it.

---

## Adding a New LLM Agent

Cortex is designed for multiple AI agents. Currently: Claude Code (architect) and OpenAI Codex (backend). To add a third agent (e.g., Gemini, Mistral, a local model):

### 1. Create an instruction file

Create `<AGENT_NAME>.md` in the repo root (e.g., `GEMINI.md`). This file must:
- Start with: **Read `CONVENTIONS.md` first**
- Define the agent's role, strengths, and what it defers to other agents
- Include the session workflow (read `.cortex/active.md`, `.cortex/tasks.md`, `.cortex/log.md`)
- Specify its branch prefix (e.g., `gemini/`)
- Specify its commit prefix (e.g., `gemini: description`)

Use `AGENTS.md` (Codex) as a template.

### 2. Register the agent

- Add a row to the **File Ownership Rules** table above for any files the agent primarily owns
- Add the agent's branch prefix to the **Git Conventions > Branches** section
- Add the agent's commit prefix to the **Git Conventions > Commits** section
- Add model routing entries to `context/model-routing.json` if the agent uses a new provider

### 3. Coordination rules

The new agent follows the same coordination protocol as existing agents:
- Reserve files in `.cortex/active.md` before editing
- Pick up tasks from `.cortex/tasks.md` assigned to it
- Write handoff notes to `.cortex/log.md` when done
- Follow the two-track commit model (shared files to main, feature code on branches)

### 4. Safe edit boundaries

New agents start with **restricted write access**:
- Can only edit files explicitly assigned in `.cortex/tasks.md`
- Cannot modify `SYSTEM.md`, `CONVENTIONS.md`, `decisions/`, or another agent's instruction file
- Must reserve files in `.cortex/active.md` before any edit
- Dennis grants broader access per-agent once trust is established

To propose changes to restricted files, the agent adds a task to `.cortex/tasks.md` assigned to the file's owner (see File Ownership Rules table).

---

## Security Rules

1. **Never commit secrets**: No API keys, tokens, passwords, or credentials in any file. Use `.env` and environment variables
2. **Never commit PII**: No personal data (emails, phone numbers, addresses) in code files. Markdown context files may contain professional contact info
3. **`.env` is in `.gitignore`**: Always. No exceptions
4. **Check before sharing**: If building a shareable module, audit for PII and secrets before publishing
5. **Human in the loop for public actions**: Never auto-post content, send messages, or make purchases without Dennis's explicit approval

---

## Testing

- Write tests for any non-trivial functionality
- Test files live next to source: `task-queue.ts` -> `task-queue.test.ts`
- Run tests before marking a task as done
- If tests fail, fix them or document why in `.cortex/log.md`

---

## When In Doubt

- **Read SYSTEM.md** for architecture and design philosophy
- **Read decisions/** for resolved technical decisions
- **Check .cortex/active.md** before touching shared files
- **Ask Dennis** if something isn't clear -- don't guess on architecture decisions
