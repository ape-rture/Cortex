# Active Work

## Currently Active

Agent: claude
Task: Phase 11g (bounded working memory), 11h (skills system), 11d (context-aware retry)
Branch: main (11g, 11h), claude/context-retry (11d)
Files:
  - src/core/working-memory.ts
  - src/core/working-memory.test.ts
  - src/core/skill-registry.ts
  - src/core/skill-registry.test.ts
  - src/core/context-retry.ts
  - src/core/context-retry.test.ts
  - src/agents/prompts/ralph-retry-ci-failed.md
  - src/agents/prompts/ralph-retry-wrong-direction.md
  - src/agents/prompts/ralph-retry-out-of-context.md
  - context/working-memory.md
Started: 2026-03-04T10:00Z

Agent: codex
Task: Orchestration Upgrade (Phase 11a, 11b, 11c, 11e, 11f, 11j)
Branch: codex/orchestration-phase11
Files:
  - src/core/workspace-manager.ts
  - src/core/workspace-manager.test.ts
  - src/core/quality-gates.ts
  - src/core/quality-gates.test.ts
  - src/core/ralph-loop.ts
  - src/core/ralph-loop.test.ts
  - src/core/session-lifecycle.ts
  - src/core/session-lifecycle.test.ts
  - src/core/agent-plugins.ts
  - src/core/agent-plugin.test.ts
  - src/core/post-tool-hooks.ts
  - src/core/post-tool-hooks.test.ts
  - src/core/types/orchestrator.ts
  - src/core/orchestration-e2e.test.ts
Started: 2026-03-04T11:18:07Z

<!-- When starting work, replace the line above with:

Agent: claude (or codex)
Task: short description of what you're doing
Branch: claude/task-slug (or "main" for shared files only)
Files:
  - path/to/file1.ts
  - path/to/file2.md
Started: YYYY-MM-DDTHH:MMZ

-->

---

## Notes

- **Update this file BEFORE starting work** (commit to main)
- **Clear your entry AFTER finishing** (commit to main)
- **Be specific about file paths** -- vague reservations don't help
- If you need a file another agent reserved, note the dependency and work on something else
