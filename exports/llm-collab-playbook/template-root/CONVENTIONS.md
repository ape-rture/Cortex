# [PROJECT_NAME] -- Shared Development Conventions

**Read this first.** This file is the shared source of truth for all AI agents.

## Code Standards

- Use strict TypeScript
- Prefer `async/await`
- Avoid `any`; use `unknown` + type guards
- Keep changes focused and test non-trivial logic

## Two-Track Git Model

### Track 1 (shared coordination/docs): commit to `main`

- `.collab/*`
- `CONVENTIONS.md`, `SYSTEM.md`, agent instruction files
- Shared architecture docs

### Track 2 (feature code): branch, test, merge

- `src/**`
- Tests
- Build and runtime configs

## Branches and Commits

- Branch prefixes: `claude/`, `codex/`, `[other-agent]/`
- Commit format: `[agent]: description`
- Keep one logical change per commit

## Coordination Protocol

1. Check `.collab/active.md` before starting
2. Pick up assigned work from `.collab/tasks.md`
3. Reserve files in `.collab/active.md`
4. On completion: update `.collab/log.md`, clear active entry, update task status

## Safety Rules

- Never commit secrets
- Keep credentials in `.env`
- Human approval required for external/public side effects
- Validate external input before processing

## Testing

- Add tests for non-trivial features
- Run tests before merge
- If tests cannot run, document it in `.collab/log.md`
