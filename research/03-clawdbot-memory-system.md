# Clawdbot's Three-Layer Memory System

**Source:** @spacepixel (pixel) - "The Three-Layer Memory System Upgrade for Clawdbot"
**URL:** https://x.com/spacepixel/status/2015967798636556777
**Date Captured:** 2026-02-02

---

## The Problem

Out-of-the-box Clawdbot memory is **static**. The default primitives -- `AGENTS.md`, `MEMORY.md`, heartbeats, cron jobs -- provide basic continuity between sessions but require manual maintenance. Life changes but memory does not update automatically.

- Facts go stale (you change jobs, move cities, shift priorities)
- No mechanism to supersede outdated information
- Context files grow unwieldy or stay too sparse
- The user becomes the memory manager instead of the AI

---

## Three-Layer Architecture

### Layer 1: Knowledge Graph (`/life/areas/`)

Entity-based storage organized by domain:

```
/life/areas/
  people/
  companies/
  projects/
  ...
```

Each entity gets two files:

- **`summary.md`** -- A living summary, rewritten weekly by synthesis. Always current, always concise.
- **`items.json`** -- Atomic timestamped facts. The append-only source of truth.

Key design principle: **Facts are superseded, never deleted.** Full history is preserved.

#### Atomic Fact Schema

```json
{
  "id": "unique-id",
  "fact": "Alice started a new role as CTO at Acme Corp",
  "category": "relationship | milestone | status | preference",
  "timestamp": "2026-01-15T10:30:00Z",
  "source": "conversation | extraction | manual",
  "status": "active | superseded",
  "supersededBy": "id-of-newer-fact | null"
}
```

Categories:
- **relationship** -- How entities relate to each other or to the user
- **milestone** -- Events, achievements, life changes
- **status** -- Current state (job title, location, project phase)
- **preference** -- Likes, dislikes, communication style, tools

### Layer 2: Daily Notes (`memory/YYYY-MM-DD.md`)

- Raw event logs -- what happened, when, in what context
- Written continuously by Clawdbot during interactions
- Serves as the unprocessed input stream that feeds Layer 1
- Ephemeral by nature; value is extracted upward into the knowledge graph

### Layer 3: Tacit Knowledge (`MEMORY.md`)

- Patterns, preferences, and lessons learned about the user
- How the user works, communication style, recurring frustrations
- Meta-knowledge: what approaches work, what to avoid
- Updated through observation over time, not single facts

---

## The Compounding Engine

Two automated processes turn raw conversation into durable, improving knowledge:

### Real-Time Extraction (~every 30 minutes)

- A cheap sub-agent (Haiku-class, approximately $0.001 per run) scans recent conversation
- Extracts durable facts and appends them to the relevant `items.json`
- Lightweight and frequent -- catches facts while context is fresh

### Weekly Synthesis (Sundays)

- Reviews all facts accumulated during the week
- Rewrites `summary.md` files to reflect current state
- Marks contradicted or outdated facts as `superseded` (with `supersededBy` pointer)
- Produces a coherent, up-to-date picture from raw atomic facts

### The Flywheel

```
Conversation
  -> Facts extracted (real-time, cheap)
    -> Knowledge graph grows (items.json)
      -> Weekly synthesis (summaries updated, stale facts marked)
        -> Better context loaded into sessions
          -> Better responses
            -> More valuable conversation
              -> (loop)
```

The system gets smarter automatically. Each conversation is an investment that compounds.

---

## Implementation Steps

1. **Create folder structure**
   ```
   ~/life/areas/people/
   ~/life/areas/companies/
   ~/clawd/memory/
   ```

2. **Add memory instructions to `AGENTS.md`**
   - Define tiered retrieval: load `summary.md` first, drill into `items.json` only when detail is needed
   - Keeps token usage efficient while preserving access to full history

3. **Add fact extraction to `HEARTBEAT.md`**
   - Heartbeat triggers the cheap sub-agent to scan and extract
   - Runs approximately every 30 minutes during active sessions

4. **Weekly synthesis cron on Sundays**
   - Automated job that reviews the week's facts
   - Rewrites summaries, marks superseded facts
   - Can be a cron job or a scheduled Clawdbot task

5. **Use the atomic fact schema consistently**
   - Every fact gets an ID, timestamp, category, and status
   - Never delete; always supersede
   - This creates an auditable, reversible knowledge history

---

## Why This Architecture vs. Alternatives

| Approach | Strength | Weakness |
|---|---|---|
| **Vector DB / RAG** | Handles scale, semantic search | Black box, cannot inspect or manually correct |
| **Monolithic context files** | Simple to set up | Do not scale, go stale, expensive to load as they grow |
| **Basic Clawdbot** (`MEMORY.md` + `AGENTS.md`) | Strong foundation, human-readable | Static, requires manual maintenance |
| **Three-Layer System** | Readable files, automatic maintenance, compounding intelligence | More setup, requires sub-agent cost |

The three-layer approach keeps the human-readable file advantage of Clawdbot's defaults while adding the automatic maintenance and scaling properties that monolithic files lack -- without the opacity of vector databases.

---

## Key Takeaways for Personal Assistant Build

### Memory Architecture Principles

1. **Separate storage by temporal grain.** Raw logs (daily notes), durable facts (knowledge graph), and meta-knowledge (tacit patterns) serve different purposes and update at different cadences. Do not collapse them into one file.

2. **Supersede, never delete.** Append-only fact storage with status flags preserves history and enables rollback. When something changes, mark the old fact as superseded and point to the new one.

3. **Tiered retrieval saves tokens.** Load summaries first. Only pull detailed fact history when the task demands it. This keeps context windows lean and costs low.

4. **Automate the maintenance loop.** The user should not be the memory manager. Cheap, frequent extraction plus periodic synthesis keeps knowledge current without human intervention.

5. **Use structured schemas for facts.** Atomic facts with IDs, timestamps, categories, and status fields are queryable, diffable, and machine-readable. Free-text notes are not.

6. **The flywheel is the goal.** Memory systems should compound: better context leads to better responses, which leads to richer conversations, which leads to more facts extracted. Design for this loop from the start.

7. **Keep it inspectable.** Markdown and JSON files on disk are debuggable. You can read them, grep them, version-control them. This matters more than elegance when things go wrong.

8. **Cost-awareness in sub-agents.** Real-time extraction does not need a frontier model. A cheap, fast model (Haiku-class) running frequently is better than an expensive model running rarely. Save the big model for synthesis and reasoning.

---

*Research notes for Personal Assistant project. Content synthesized from the source thread linked above.*
