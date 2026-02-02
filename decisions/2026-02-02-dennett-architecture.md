# Decision: Dennett's Architecture as Cortex Foundation

**Date**: 2026-02-02
**Status**: Decided -- this is the philosophical foundation
**Context**: Research in `research/11-dennett-consciousness-agents.md` mapped Dennett's Multiple Drafts Model to LLM agent architecture. This document makes those mappings *prescriptive* -- turning philosophy into engineering decisions.

---

## The Core Insight

Dennett says consciousness isn't a central observer watching a mental movie. It's many parallel processes competing, with "winners" becoming globally influential. The "self" is just a story the brain tells for coherence.

This maps 1:1 to how Cortex should work. Not as metaphor -- as architecture.

---

## Two Levels of Agents

Cortex has two distinct agent layers. Both follow Dennett's principles, but at different scales.

### Level 1: Build-Time Agents (NOW)

These agents **build** Cortex. They are the developers.

| Agent | Role | How It Works |
|---|---|---|
| **Claude Code** | Architect, system design, research, documentation | CLI sessions, branches `claude/*` |
| **OpenAI Codex** | Implementation, feature building, testing | API/CLI sessions, branches `codex/*` |

They coordinate via `.cortex/` files. Dennis merges to main. This is already operational.

### Level 2: Runtime Agents (FUTURE)

These agents **are** Cortex. They run autonomously, triggered by events, each specialized.

| Agent | Trigger | Purpose |
|---|---|---|
| Sales Watcher | Cron (hourly) | Relationship decay, FOCUS alerts, Telegram context |
| Code Watcher | Cron (daily) | Unpushed commits, stale branches, failing tests |
| Content Creator | After meetings | Create publishable insights; scanner is a sub-step |
| Pattern Detector | Weekly | Behavioral patterns, feature proposals, anomalies |
| Triage Agent | After multi-agent cycles or explicit high-level tag | Align outputs, classify, suggest routing |
| Memory Synthesizer | Nightly | Compound knowledge, merge notes, clean stale items |
| Security Auditor | On publish/share | PII/key scan, threat check before anything goes public |

**Level 1 builds Level 2.** Claude Code designs the agent architectures. Codex implements them. The agents they build eventually run autonomously.

---

## Dennett Principle -> Architecture Mapping

### 1. Multiple Drafts -> Parallel Agents

**Dennett**: Many processes run in parallel. They compete. No single "true thought."

**Current (Phase 0-1)**: Single Claude session. One model thinks, one draft wins. This is actually a Cartesian Theater -- the thing Dennett rejects.

**Target (Phase 5+)**: Multiple agents spawn in parallel. Each returns a structured result. A salience scorer ranks them. Only winners surface.

**Concrete example**: Morning routine triggers Sales Watcher and Content Creator in parallel. Sales Watcher finds 2 stale contacts. Content Creator extracts 1 publishable insight from yesterday's transcript. Triage Agent runs after the cycle to check alignment and suggests the insight as higher priority because it matches this week's focus. That's what surfaces first.

### 2. No Cartesian Theater -> Thin Orchestrator + Policy Guardrails

**Dennett**: No central observer. No homunculus. Just processes.

**Architecture rule**: The orchestrator is not a reasoning agent. It is a thin Node.js process that:
- Reads config (which agents to spawn, on what triggers)
- Spawns subprocesses
- Collects structured JSON outputs
- Routes results to salience scorer
- Delivers winners to user

The orchestrator can apply deterministic guardrails (rate limits, permission checks, dedupe, basic thresholding), but it does not interpret meaning. Any semantic reasoning is delegated to an agent in the pool (for example, a Triage Agent).

This is critical -- the moment the orchestrator becomes the primary judge of meaning, you've rebuilt the Cartesian Theater.

### 3. Global Workspace -> Shared Context Bus

**Dennett / GWT**: Consciousness = information broadcast to many subsystems. What's globally available influences everything.

**Architecture**: The markdown file system IS the Global Workspace.

```
/context/       -> shared knowledge (all agents read)
/actions/       -> task state (orchestrator + agents read/write)
/meetings/      -> interaction history (content + sales agents read)
/contacts/      -> relationship data (sales agent reads/writes)
/daily/         -> temporal context (pattern detector reads)
/projects/      -> work state (code agent reads)
```

Rules:
- All agents can READ the shared context
- Each agent can only WRITE to its scoped outputs
- The orchestrator merges agent outputs into shared context after validation
- This prevents memory corruption while enabling information broadcast

### 4. Fame in the Brain -> Salience Scoring

**Dennett**: Most cognition is unconscious. Only what becomes "famous" (globally influential) reaches awareness.

**Architecture**: Most agent outputs never reach the user. Only outputs that pass the fame threshold get surfaced.

**Salience scoring formula** (initial, will tune from data):

```
salience = urgency * relevance * novelty * actionability

Where:
- urgency: time-sensitive? (meeting in 1hr > stale branch from 3 days ago)
- relevance: connected to current focus? (check weekly-focus.md)
- novelty: new information? (first alert > repeated reminder)
- actionability: can user do something about it now?
```

Implementation options (in order of complexity):
1. **Rule-based** (Phase 5): Static weights per agent type. Sales alerts always score high urgency. Code reminders score medium.
2. **Hybrid rules + small model** (Phase 5-6): Rules provide priors, a small model adjusts within bounds. Useful for consistency.
3. **LLM-scored** (Phase 7): A small model scores each output against current context. More accurate, costs tokens.
4. **Learned** (Phase 8+): Track which alerts user acts on vs. dismisses. Tune weights from behavior data.

### 5. Narrative Self -> SYSTEM.md + Compounding Memory

**Dennett**: The self is a "center of narrative gravity" -- a useful fiction. Identity = story coherence over time.

**Architecture**: Cortex's identity IS its persistent files. SYSTEM.md + context/ + memory = the narrative self. This isn't configuration -- it's the mechanism that creates coherent behavior.

Design implications:
- **Memory maintenance is a core function**, not an add-on. The Memory Synthesizer agent runs nightly specifically to maintain narrative coherence.
- **Every agent session starts by reading SYSTEM.md** -- this is literally "loading the self."
- **Handoff notes in `.cortex/log.md`** maintain continuity across sessions -- the narrative doesn't break between Claude Code and Codex.
- **Weekly synthesis** compresses episodic memory into stable identity. This is how the "story" compounds.

### 6. Post-Hoc Explanation -> Report Results, Not Process

**Dennett**: Chain-of-thought is explanation after the fact, not the actual decision process. Confabulation is normal.

**Architecture rule**: Agents return results and confidence scores. They don't need to explain their reasoning unless asked. The orchestrator doesn't log chain-of-thought -- it logs outcomes.

```json
// Agent output schema (not rationale)
{
  "agent": "sales-watcher",
  "finding": "No contact with Sarah Chen in 34 days",
  "confidence": 0.95,
  "urgency": "medium",
  "suggested_action": "Send check-in about Q3 data partnership",
  "context_refs": ["contacts/sarah-chen.md", "meetings/2025-12/2025-12-28-sarah-data.md"]
}
```

If the user asks "why?" -- then the agent can be re-invoked with a reasoning prompt. But the default path is action, not explanation.

### 7. Competence Without Comprehension -> Simple Agents, Smart Swarm

**Dennett**: You don't need understanding for competence. A thermostat is competent at temperature regulation without comprehending heat.

**Architecture rule**: Each runtime agent should be as simple as possible. A Sales Watcher doesn't need to "understand" relationships -- it just checks dates and flags gaps. A Code Watcher doesn't need to "understand" your architecture -- it just checks git timestamps.

Intelligence emerges from:
- Many simple agents covering different domains
- The salience scorer ranking their outputs
- The memory system providing context
- The user making final decisions

Don't build one super-agent that does everything. Build many dumb agents that each do one thing well.

### 8. Identity Through Continuity -> Protect the Narrative

**Dennett**: Identity comes from narrative continuity. Disruptions to the narrative cause pathology.

**Architecture rules**:
- **Version control on memory files** -- git tracks all changes, rollback is possible
- **Memory audits** -- detect and flag corrupted or contradictory entries
- **Graceful degradation** -- if memory is corrupted, Cortex surfaces the issue rather than acting on bad data
- **No single point of narrative failure** -- the identity is distributed across many files, not concentrated in one

---

## Orchestrator Design

### Architecture Diagram

```
[Triggers]
  Cron (hourly/daily/weekly)
  Slack message (#cortex channel)
  Webhook (GitHub, Attio, FOCUS)
  File change (watched directories)
  CLI command (manual invoke)
        |
   [Orchestrator]  <-- NOT intelligent. Config-driven scheduler.
        |
   Read trigger config -> determine which agents to spawn
        |
   +---------+---------+---------+---------+
   |         |         |         |         |
[Agent A] [Agent B] [Agent C] [Agent D] [Agent E]
   |         |         |         |         |
   Each agent:
   1. Receives scoped system prompt
   2. Receives scoped file access list
   3. Reads relevant context from markdown files
   4. Does its work (LLM call, API call, or local script)
   5. Returns structured JSON output
   |         |         |         |         |
   +---------+---------+---------+---------+
        |
   [Policy Gate]
   - Deterministic checks only (permissions, rate limits, dedupe)
   - No semantic reasoning
        |
   [Salience Scorer]
   - Ranks all agent outputs
   - Applies fame threshold
   - Groups related findings
        |
   [Output Router]
   - Slack: send message to #cortex
   - CLI: queue for next session
   - Daily digest: append to daily/
   - Action items: append to actions/
        |
   [Memory Writer]
   - Update relevant context files
   - Append to activity log
   - Trigger memory synthesis if threshold reached
```

### Agent Execution Model

Agents can be executed as:

| Execution Type | When to Use | Example |
|---|---|---|
| **Claude API call** | Complex reasoning, nuanced analysis | Content Creator, Pattern Detector |
| **Codex API call** | Code analysis, generation, review | Code Watcher, Security Auditor |
| **Local script** | Simple checks, file operations, API calls | Git timestamp check, Attio API poll |
| **MCP tool call** | Integration actions | Slack send, Calendar read, GitHub check |
| **Triage Agent (LLM)** | Light semantic reasoning | Classify, summarize, and pre-score outputs |

The orchestrator doesn't care HOW an agent runs -- it just spawns the process, waits for JSON output, and collects results. This makes agents swappable and testable.

### Agent Output Schema

Every agent returns the same structure:

```json
{
  "agent": "string",
  "timestamp": "ISO-8601",
  "findings": [
    {
      "type": "alert | insight | suggestion | action_item",
      "summary": "One-line description",
      "detail": "Full context if needed",
      "urgency": "critical | high | medium | low",
      "confidence": 0.0-1.0,
      "suggested_action": "What the user could do",
      "context_refs": ["file paths referenced"],
      "requires_human": true/false
    }
  ],
  "memory_updates": [
    {
      "file": "path to update",
      "operation": "append | update | flag",
      "content": "what to write"
    }
  ],
  "errors": []
}
```

### Security Model for Runtime Agents

Each agent gets a **permission envelope**:

```json
{
  "agent": "sales-watcher",
  "can_read": ["contacts/", "meetings/", "context/company.md"],
  "can_write": ["actions/queue.md"],
  "can_call_apis": ["attio:read", "focus:read"],
  "can_send_messages": false,
  "requires_human_approval": ["any write to contacts/"],
  "max_tokens": 4000,
  "model": "haiku",
  "timeout_ms": 30000
}
```

Trust boundaries from SYSTEM.md apply:
- **Core files** (SYSTEM.md, context/me.md) -- read-only for all runtime agents
- **Integration data** (contacts/, meetings/) -- scoped read, approved write
- **Public actions** (sending messages, posting) -- always requires human approval
- **Local-only data** (contacts, meetings, in-flight plans) -- never routed to cloud unless Dennis explicitly approves a redacted summary

### Triage Agent Invocation

- The Triage Agent does not run on every input.
- It runs after multi-agent cycles to check alignment, or when Dennis explicitly tags a task as "high-level".
- High-level tag (example): prefix the request with `[high-level]` or include `high-level: true`.
- It uses Dennis' stated importance as a hard constraint and only makes suggestions (no autonomous decisions).

### Importance Signals

- Importance is derived from Dennis' explicit input when present.
- The system can infer importance from context and recent priorities (free-flowing for now).
- Inferred importance should never override explicit importance.

---

## How This Evolves Over Time

| Phase | Dennett Alignment | What Changes |
|---|---|---|
| **Phase 0-1** (now) | Cartesian Theater | Single Claude session does everything. One brain, sequential processing |
| **Phase 5** (self-evolution) | Early Multiple Drafts | Orchestrator MVP. 2-3 agents run on cron. Basic salience (rule-based) |
| **Phase 7** (always-on) | Full Multiple Drafts | Parallel agents, LLM-scored salience, proactive surfacing via Slack |
| **Phase 8** (sharing) | Publishable swarm | Agent templates others can use. The architecture pattern itself becomes shareable |

The key insight: **we don't need to build the full Dennettian system to start.** Phase 0-1 is a Cartesian Theater and that's fine -- it's already useful. Each phase adds more distributed processing. The architecture naturally evolves toward Dennett's model as capabilities grow.

--- 

## Practicality Notes (Start Small, Stay Useful)

This is practical if we keep it staged:
- Phase 0-1: single session, sequential. No orchestrator required.
- Phase 5: add 2 runtime agents (Sales Watcher, Content Creator). Keep outputs small and structured.
- Orchestrator remains thin, but it can apply deterministic policy rules and scheduling.
- If light reasoning is needed, treat it as an agent (Triage Agent), not part of the orchestrator.
- Avoid a fan-out explosion early. Parallelism is useful only when there are distinct, bounded tasks.

---

## Connection to Other Decisions

- **Language choice** (TypeScript): Orchestrator and agents share a runtime. Node.js child_process or worker_threads for parallel agent execution.
- **Model routing** (`context/model-routing.json`): Each agent type maps to a model. The orchestrator reads routing config (summary in `context/model-routing.md`).
- **Security** (`decisions/2026-02-02-blocking-decisions.md`): Permission envelopes enforce the trust boundaries already designed.
- **Interface** (Slack + CLI): Orchestrator outputs route to Slack for push notifications, CLI for interactive sessions.

---

## Open Questions for Implementation

1. **Agent hot-reload**: Can we update an agent's system prompt without restarting the orchestrator?
2. **Agent-to-agent communication**: Should agents be able to trigger other agents? (e.g., Content Creator finds an insight -> triggers Thread Builder). Dennett would say yes -- processes can activate other processes.
3. **Failure cascades**: If one agent fails, does the whole cycle fail? Dennett's model suggests graceful degradation -- other drafts still compete.
4. **Memory contention**: If two agents want to update the same file simultaneously, who wins? Need a simple locking or merge strategy.

---

*This document is the philosophical foundation for Cortex's architecture. All agent design should reference these principles. See `research/11-dennett-consciousness-agents.md` for the underlying research.*
