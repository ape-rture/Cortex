# Decision: Content DB Integration Architecture

**Date**: 2026-02-05
**Status**: Approved
**Deciders**: User + Claude

---

## Context

Cortex needs access to Indexing Co content stored in a shared database. This database:
- Stores content from X, LinkedIn, YouTube, manual uploads
- Is populated by automated ingestion pipelines (cron, webhooks)
- Is shared with the Marketing Tool (multi-user web app)
- Requires semantic search (RAG) capabilities

Key constraint: Cortex remains local-first for personal context, but needs cloud access for shared content.

---

## Decision

### 1. Two-Domain Architecture

**Personal (Cortex)**: Local markdown + git
- No change to existing approach
- Fast, private, offline-capable
- Appropriate for bounded personal context

**Shared (Indexing Co)**: Managed Postgres + pgvector
- Cloud-hosted for multi-user access
- Semantic search via vector embeddings
- Single source of truth for all consumers

### 2. Managed Service: Supabase

Selected for:
- Native pgvector support
- Auto-generated REST API (PostgREST)
- Built-in auth for Marketing Tool users
- Edge functions for ingestion webhooks
- Generous free tier, scales well

### 3. Integration: MCP Server

Cortex accesses Content DB via MCP server (`@indexingco/content-mcp`):

```
Cortex (Claude Code)
    │
    ▼
MCP Client ──→ content-mcp server ──→ Supabase (Postgres + pgvector)
                                           ▲
                                           │
Marketing Tool ──→ REST API (PostgREST) ───┘
```

Benefits:
- Native to Claude Code tooling
- Clean interface boundary
- Same DB serves all consumers
- Can swap implementation without changing interface

### 4. Data Model

Single `content_items` table with:
- Text content (title, body, summary)
- Source tracking (platform, URL, ID)
- Classification (topics[], content_type, status)
- Vector embedding for semantic search
- Flexible metadata (JSONB)

See `research/13-content-db-architecture.md` for full schema.

### 5. Access Patterns

| Consumer | Method | Use Case |
|----------|--------|----------|
| Cortex | MCP Server | Search, get, upsert drafts |
| Marketing Tool | REST API | Full CRUD, scheduling, analytics |
| Ingestion Pipes | Edge Functions / Direct SQL | Bulk upserts |

---

## Alternatives Considered

### Direct DB Connection from Cortex
- Rejected: Tight coupling, credential management complexity

### Sync to Local Cache
- Rejected: Stale data, sync complexity, duplication

### Composio/External MCP Tools
- Rejected: External dependency, less control

### Self-hosted Postgres
- Rejected for now: More ops overhead, Supabase sufficient to start

---

## Consequences

### Positive
- Clean separation: local personal context vs shared content
- Single source of truth for content across all tools
- MCP interface is stable even if backend changes
- Supabase handles auth, API, scaling

### Negative
- Network dependency for content access (acceptable for shared data)
- Embedding costs (minimal with text-embedding-3-small)
- Need to build and maintain MCP server

### Risks
- Supabase vendor lock-in (mitigated: standard Postgres, can migrate)
- Embedding model changes (mitigated: store dimension in config)

---

## Implementation Plan

See `decisions/2026-02-05-content-db-implementation-plan.md`

---

## References

- Research: `research/13-content-db-architecture.md`
- Dennett architecture: `decisions/2026-02-02-dennett-architecture.md`
- Takopi patterns: `research/12-takopi-telegram-bridge.md`
