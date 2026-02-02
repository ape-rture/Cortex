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

### Branches
- `main` -- stable branch. **Never push directly to main.**
- `claude/[task-slug]` -- branches created by Claude Code
- `codex/[task-slug]` -- branches created by OpenAI Codex
- `dennis/[task-slug]` -- branches created by Dennis manually

Examples: `claude/task-queue`, `codex/slack-bot`, `claude/memory-system`

### Commits
Format: `[agent]: description`

```
claude: add task queue processing to core
codex: implement Slack webhook handler
claude: fix routing fallback for Codex provider
codex: add tests for content pipeline module
dennis: update SYSTEM.md with new requirements
```

- Keep commits focused -- one logical change per commit
- Write in imperative mood: "add", "fix", "update", not "added", "fixed", "updated"

### Merging
- **Dennis merges to main** -- human in the loop, always
- Agents create branches and do their work there
- If a branch is ready, the agent notes it in `.cortex/log.md` and `.cortex/active.md`

---

## Coordination Protocol

### Before Starting Any Task

1. **Read `.cortex/active.md`** -- check if another agent is working and what files they've reserved
2. **Read `.cortex/tasks.md`** -- find your assigned task
3. **Update `.cortex/active.md`** -- register yourself, your task, and the files you'll touch
4. **Create your branch** -- `claude/[slug]` or `codex/[slug]`

### While Working

- Stay on your branch
- Only touch files you've reserved in `active.md`
- If you need a file another agent has reserved: STOP, note the dependency in `active.md`, and move to a different task or wait

### When Finishing a Task

1. **Commit your work** with proper commit message format
2. **Update `.cortex/active.md`** -- clear your entry, unreserve files
3. **Append to `.cortex/log.md`** -- what you did, files changed, what to pick up next
4. **Update `.cortex/tasks.md`** -- move task from "In Progress" to "Done"

### Handoff Between Agents

When one agent finishes work that another agent should continue:
1. Finishing agent writes a handoff note in `.cortex/log.md` with:
   - What was completed
   - What remains
   - Any context the next agent needs
   - Which files are relevant
2. Finishing agent adds a task to `.cortex/tasks.md` assigned to the other agent
3. The next agent picks it up on their next session

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
