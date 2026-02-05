# Content DB Architecture Research

**Date**: 2026-02-05
**Topic**: Shared Content Database for Indexing Co + Cortex Integration
**Status**: Research Complete

---

## Problem Statement

Cortex (personal assistant) needs to access Indexing Co content that lives in a shared database. This database will:
- Store content from multiple social channels (X, LinkedIn, YouTube)
- Be populated by automated ingestion pipelines
- Be shared with the Marketing Tool (multi-user)
- Support semantic search (RAG) for content discovery

The challenge: How does a local-first personal assistant integrate with shared cloud infrastructure?

---

## Two Memory Domains

### Domain 1: Cortex Personal (Local)

| Aspect | Details |
|--------|---------|
| Storage | Local markdown files + git |
| Users | Single (owner) |
| Scale | ~100s of files, <1MB |
| Query pattern | Simple file reads, grep |
| Update pattern | Append-mostly, session-based |
| Privacy | Private context, decisions, contacts |

**Verdict**: Local-first is correct. No DB needed.

### Domain 2: Indexing Co Content (Shared)

| Aspect | Details |
|--------|---------|
| Storage | Managed Postgres + pgvector |
| Users | Multiple (team, marketing tool users) |
| Scale | Growing corpus, thousands of items |
| Query pattern | Semantic search, filters, joins |
| Update pattern | Continuous ingestion, multi-writer |
| Privacy | All public content, user verification only |

**Verdict**: Cloud DB with RAG is appropriate.

---

## Local vs Cloud RAG Analysis

### When Local BM25/Embeddings Win

- Sub-millisecond retrieval from in-memory indexes
- No network latency or API rate limits
- Zero external dependencies, works offline
- All data stays local (privacy)
- No per-query costs after initial embedding
- Easy to version control, fast iteration

**Fits**: Code search, bounded corpus, single-user, offline requirements

### When DB + RAG Wins

- Scale: >100K documents, >10GB corpus
- Concurrent users needing shared state
- Real-time updates with ACID properties
- Complex queries: structured data + text + filters
- Access control, multi-tenancy
- Analytics, aggregations, reporting

**Fits**: E-commerce, collaborative tools, monitoring, shared knowledge bases

### Cortex Position

| Dimension | Cortex Personal | Indexing Co Content |
|-----------|-----------------|---------------------|
| Documents | ~100 files | Growing (1000s) |
| Users | 1 | Multiple |
| Query type | Simple lookup | Semantic + filters |
| Update | Append-only | Continuous ingestion |
| **Decision** | **Local** | **Cloud DB + RAG** |

---

## Integration Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         INDEXING CO PLATFORM                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │              MANAGED POSTGRES + PGVECTOR                        │   │
│  │              (Supabase recommended)                             │   │
│  │                                                                  │   │
│  │   content_items    sources    topics    embeddings              │   │
│  └──────────────────────────┬──────────────────────────────────────┘   │
│                             │                                           │
│         ┌───────────────────┼───────────────────┐                      │
│         │                   │                   │                      │
│         ▼                   ▼                   ▼                      │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                │
│  │ MCP Server  │    │  REST API   │    │  Direct SQL │                │
│  │ (Claude)    │    │  (Web/Apps) │    │  (Analytics)│                │
│  └──────┬──────┘    └──────┬──────┘    └─────────────┘                │
│         │                  │                                           │
└─────────┼──────────────────┼───────────────────────────────────────────┘
          │                  │
          │                  │
┌─────────▼─────────┐  ┌─────▼──────────────┐  ┌────────────────────────┐
│     CORTEX        │  │  MARKETING TOOL    │  │   INGESTION PIPES      │
│  (Personal Agent) │  │  (Multi-user)      │  │                        │
├───────────────────┤  ├────────────────────┤  ├────────────────────────┤
│ • MCP client      │  │ • Web UI           │  │ • Cron jobs            │
│ • Local context   │  │ • REST API client  │  │ • Webhooks (social)    │
│ • Content pulls   │  │ • User auth        │  │ • Cortex upserts       │
│ • Draft creation  │  │ • Scheduling       │  │ • Manual uploads       │
└───────────────────┘  │ • Analytics        │  └────────────────────────┘
                       └────────────────────┘
```

---

## Integration Options Evaluated

| Approach | Description | Verdict |
|----------|-------------|---------|
| **API Gateway** | REST/GraphQL API, Cortex calls it | Good, but extra layer |
| **Shared DB Read Replica** | Direct DB connection | Tight coupling, avoid |
| **MCP Server** | Content DB as MCP tool | **Recommended** - native to Claude |
| **Sync to Local Cache** | Periodic export to markdown | Stale data, sync complexity |
| **Composio/Rube** | External MCP tools | Dependency, less control |

**Decision**: MCP Server + REST API

- MCP Server for Claude Code / Cortex access
- REST API for Marketing Tool and other apps
- Both hit same DB, same data model

---

## Managed Service Selection

| Service | pgvector | Auth | REST API | Edge Functions | Verdict |
|---------|----------|------|----------|----------------|---------|
| **Supabase** | Native | Built-in | PostgREST | Yes | **Recommended** |
| Neon | Native | No | No | No | Good for DB-only |
| Railway | Manual | No | No | No | More DIY |
| Turso | No | No | No | No | Wrong model |

**Supabase advantages**:
- pgvector out of the box
- Auto-generated REST API (PostgREST)
- Auth for marketing tool users
- Edge functions for webhooks/ingestion
- Realtime subscriptions if needed
- Generous free tier to start

---

## Data Model

### content_items (Core Table)

```sql
CREATE TABLE content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Content
  title TEXT,
  body TEXT NOT NULL,
  summary TEXT,

  -- Source tracking
  source_platform TEXT NOT NULL,  -- 'twitter', 'linkedin', 'youtube', 'manual'
  source_url TEXT,
  source_id TEXT,                 -- Platform-specific ID

  -- Classification
  topics TEXT[],
  content_type TEXT,              -- 'thread', 'post', 'article', 'video', 'idea'
  status TEXT DEFAULT 'published', -- 'draft', 'scheduled', 'published', 'archived'

  -- Embedding for semantic search
  embedding vector(1536),         -- OpenAI ada-002 or compatible

  -- Metadata
  author TEXT,
  published_at TIMESTAMPTZ,
  ingested_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'     -- Flexible extra data (engagement stats, etc)
);

-- Indexes
CREATE INDEX ON content_items USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX ON content_items (source_platform);
CREATE INDEX ON content_items (status);
CREATE INDEX ON content_items USING GIN (topics);
CREATE UNIQUE INDEX ON content_items (source_platform, source_id) WHERE source_id IS NOT NULL;
```

### ingestion_runs (Tracking)

```sql
CREATE TABLE ingestion_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_platform TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  items_processed INT DEFAULT 0,
  items_added INT DEFAULT 0,
  status TEXT DEFAULT 'running',  -- 'running', 'completed', 'failed'
  error TEXT
);
```

---

## MCP Server Interface

### Tools to Expose

```typescript
// @indexingco/content-mcp

content_search({
  query: string,          // Semantic search query
  filters?: {
    platform?: string[],  // ["twitter", "linkedin"]
    topics?: string[],
    status?: string,
    date_range?: [string, string],
  },
  limit?: number,         // Default 10
}) → ContentItem[]

content_get({
  id: string
}) → ContentItem

content_upsert({
  title?: string,
  body: string,
  source_platform: string,
  source_url?: string,
  topics?: string[],
  status?: string,
  metadata?: object,
}) → { id: string }

content_ideas({
  topic?: string,
  status?: string,        // Default 'draft'
  limit?: number,
}) → ContentItem[]

content_similar({
  content_id: string,
  limit?: number,
}) → ContentItem[]
```

### Example Usage in Cortex

```
User: "Write a thread about AI agents, reference our existing content"

Cortex:
  1. MCP: content_search("AI agents", limit=5)
     → Returns 5 relevant published items

  2. Local: Read context/brand-voice.md
     → Get tone, style guidelines

  3. Generate draft thread

  4. MCP: content_upsert({
       title: "AI Agents Thread Draft",
       body: "...",
       source_platform: "manual",
       status: "draft",
       topics: ["ai-agents"]
     })
     → Saved to shared DB, visible in Marketing Tool
```

---

## Access Patterns Summary

| Consumer | Access Method | Operations |
|----------|---------------|------------|
| **Cortex** | MCP Server | Search, get, upsert drafts |
| **Marketing Tool** | REST API (PostgREST) | Full CRUD, scheduling, analytics |
| **Ingestion Pipes** | Direct SQL / Edge Functions | Bulk upserts, deduplication |
| **Analytics** | Direct SQL | Aggregations, reporting |

---

## Security Model

- **User verification**: Supabase Auth for Marketing Tool users
- **No row-level access control**: All content is public/shared
- **API keys**: MCP server uses service role key (server-side only)
- **Rate limiting**: Supabase built-in + custom for expensive queries

---

## Embedding Strategy

| Option | Dimensions | Cost | Quality |
|--------|------------|------|---------|
| OpenAI text-embedding-ada-002 | 1536 | $0.0001/1K tokens | Good |
| OpenAI text-embedding-3-small | 1536 | $0.00002/1K tokens | Better, cheaper |
| Cohere embed-english-v3 | 1024 | Free tier available | Good |
| Local (nomic-embed-text) | 768 | Free (compute) | Good for local |

**Recommendation**: Start with `text-embedding-3-small` for cloud DB.
- Good quality, very cheap
- Can switch later if needed
- Store dimension in config for flexibility

---

## Migration Path

If scale grows beyond Supabase limits:
1. Export to self-hosted Postgres + pgvector
2. Or migrate to dedicated vector DB (Pinecone, Weaviate)
3. MCP interface stays the same (implementation detail)

---

## References

- Supabase pgvector: https://supabase.com/docs/guides/ai
- MCP Specification: https://modelcontextprotocol.io/
- Takopi patterns: research/12-takopi-telegram-bridge.md
- Dennett architecture: decisions/2026-02-02-dennett-architecture.md
