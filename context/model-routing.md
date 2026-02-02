# Model Routing Configuration

Last updated: 2026-02-02
Mode: Hybrid (user override + classifier + static routes)
Canonical config: context/model-routing.json

## How Routing Works

1. User can override any routing ("use opus for this", "send this to codex").
2. Otherwise a classifier tags the task type and sensitivity.
3. The router selects the primary model from the canonical config.
4. If the call fails or times out, try the fallback chain.
5. Log outcomes to context/model-performance.md.

## Local-Only Data Policy

The following data never leaves local execution unless Dennis explicitly approves a redacted summary:
- Contacts (contacts/)
- Meetings and transcripts (meetings/, daily/)
- In-flight plans and strategy (projects/, context/weekly-focus.md, decisions/)

If a task touches any of the above, route to local models only.

## Routing Table (Summary)

| Task Type | Primary | Fallback | Notes |
|---|---|---|---|
| Quick capture / filing | haiku | sonnet | Fast, cheap |
| Meeting summary | sonnet | opus | Balance speed + quality |
| Complex reasoning | opus | gpt-4o | Cross-provider for hard problems |
| Code generation | sonnet | codex | Codex for heavy backend/algorithmic work |
| Code review | sonnet | codex | Different model catches different issues |
| Content drafting | sonnet | - | Creative + fast |
| Research / analysis | opus | gpt-4o | Needs depth |
| Classification / routing | haiku | sonnet | Speed is king |
| Bulk operations | haiku | - | Cheap batch processing |
| Security audit | opus | - | Deep reasoning |
| Vibe coding (interactive) | codex | sonnet | Codex for dedicated coding sessions |

## Coding Workflow: Claude Code + Codex

| Task Type | Agent | Why |
|---|---|---|
| System prompts, agent definitions, skill configs | Claude Code | Prompt engineering is a core strength |
| Planning, task breakdown, architecture | Claude Code | Designs the plan, Codex implements |
| Frontend / UI / components | Claude Code | Design and UX decisions |
| Data models, schemas, types | Codex | Data modeling strength |
| Backend services, API endpoints | Codex | Server-side implementation |
| Integrations (Slack, Attio, webhooks) | Codex | Plumbing and API bridges |
| Code review / second opinion | Opposite of what wrote it | Different models catch different issues |
| Performance optimization | Codex | Profiling and low-level optimization |
| Debugging / tracing | Claude (Opus) | Strong reasoning about state |

## Runtime Agent Routing

Each runtime agent (see `decisions/2026-02-02-dennett-architecture.md`) is powered by a specific model. The orchestrator reads this config when spawning agents.

| Agent | Default Model | Rationale | Max Tokens | Escalation |
|---|---|---|---|---|
| **Triage Agent** | haiku | Runs after multi-agent cycles or high-level tag. Classify + suggest | 1000 | sonnet if confidence < 0.7 |
| **Sales Watcher** | haiku | Simple date/gap checks against contacts/ | 2000 | sonnet for relationship analysis |
| **Code Watcher** | haiku | Git timestamp checks, branch status | 1500 | sonnet for failure diagnosis |
| **Content Creator** | sonnet | Creates publishable insights; scanner is a sub-step | 4000 | opus for high-value content |
| **Pattern Detector** | sonnet | Needs reasoning across multiple data sources | 4000 | opus for complex pattern synthesis |
| **Memory Synthesizer** | sonnet | Compounding knowledge requires good writing | 6000 | - |
| **Security Auditor** | opus | Must not miss PII/keys. High stakes | 4000 | - |

### Escalation Rules

Agents can request escalation to a more powerful model mid-task. The orchestrator handles this:
- Agent returns `{"escalation_needed": true, "reason": "..."}` instead of findings
- Orchestrator re-spawns the same agent with the escalation model
- Max one escalation per agent per cycle (prevents loops)
- Escalations are logged in performance tracking

### Salience Scorer Routing

The salience scorer that ranks agent outputs:
- **Phase 5-6** (MVP): Hybrid rules + small model. Rules set priors, small model adjusts within bounds
- **Phase 7** (full): Small model call with all agent outputs as context. Returns ranked list
- **Phase 8+** (learned): Weights tuned from user behavior (which alerts were acted on)

## Performance Tracking

After each LLM call, log:
- Task type
- Provider + model used
- Input tokens / output tokens
- Latency (time to first token, total time)
- Success (did the output achieve the task?)
- Cost estimate

Store in context/model-performance.md. Review weekly for routing optimization.

---

This file is a human-readable summary. The canonical source is context/model-routing.json.
