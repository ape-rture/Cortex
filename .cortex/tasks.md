# Task Board

*Dennis assigns tasks here. Agents pick up their assigned work.*

---

## Queued

*Add tasks with `Agent: claude` or `Agent: codex` to assign.*
<!-- Example:
- **Build Slack queue bot** -- Agent: codex -- Create minimal Slack bot that appends messages from #cortex to /actions/queue.md. See decisions/2026-02-02-blocking-decisions.md for specs.
-->
- **Define how other LLM agents participate** -- Agent: claude -- Add a short section in CONVENTIONS.md or SYSTEM.md covering how to add a new LLM agent, where its instruction file lives, and how it can propose edits safely.
- **Finalize provider model IDs** -- Agent: claude -- Replace TBD model ids in context/model-routing.json with actual API model ids once selected.
- **Document redaction flow for local-only data** -- Agent: claude -- Add a brief workflow for redacting contacts/meetings/plans when cloud routing is explicitly approved.
- **Scaffold TypeScript project** -- Agent: codex -- Initialize `package.json` (ESM, strict), `tsconfig.json` (strict mode, ESM, paths), install `@anthropic-ai/sdk` and `openai` SDKs. Confirm `src/` structure from CONVENTIONS.md. Branch: `codex/project-scaffold`.
- **Implement routing layer** -- Agent: codex -- Build `src/core/routing.ts` implementing the `Router` interface from `src/core/types/routing.ts`. Must: load `context/model-routing.json`, resolve user overrides, apply data policy rules, call Anthropic/OpenAI SDKs, handle fallback chain, log to `context/model-performance.md`. Branch: `codex/routing-layer`. Depends on: scaffold task.
- **Implement markdown read/write utils** -- Agent: codex -- Build `src/utils/markdown.ts` with helpers: `readMarkdownFile(path)`, `parseTaskQueue(content)` -> `Task[]`, `serializeTaskQueue(tasks)` -> `string`, `appendToFile(path, content)`, `parseContactFile(content)`. Used by task queue and agents. Branch: `codex/markdown-utils`. Depends on: scaffold task.
- **Implement task queue processor** -- Agent: codex -- Build `src/core/task-queue.ts` implementing the `TaskQueue` interface from `src/core/types/task-queue.ts`. Reads/writes `actions/queue.md`. Uses markdown utils. Branch: `codex/task-queue`. Depends on: scaffold + markdown-utils.

## In Progress

*Agent moves task here when starting.*

## Done

- **Phase 1 contracts: types, schemas, /gm skill** -- Agent: claude -- Branch: `claude/phase1-contracts`. Created all TypeScript interfaces (agent output, routing, task queue, orchestrator, permissions) and /gm skill prompt.
