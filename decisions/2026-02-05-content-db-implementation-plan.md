# Implementation Plan: Content DB Integration

**Date**: 2026-02-05
**Related Decision**: `decisions/2026-02-05-content-db-integration.md`
**Research**: `research/13-content-db-architecture.md`

---

## Overview

Build the shared Content DB infrastructure for Indexing Co, with MCP integration for Cortex.

```
Phase 1: Database Setup (Supabase)
    ↓
Phase 2: MCP Server (@indexingco/content-mcp)
    ↓
Phase 3: Cortex Integration
    ↓
Phase 4: Ingestion Pipelines (Marketing Tool)
    ↓
Phase 5: Marketing Tool UI
```

---

## Phase 1: Database Setup

**Owner**: User (Supabase console)
**Effort**: 1-2 hours

### Tasks

- [ ] Create Supabase project for Indexing Co
- [ ] Enable pgvector extension
- [ ] Create `content_items` table with schema:

```sql
-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Core content table
CREATE TABLE content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Content
  title TEXT,
  body TEXT NOT NULL,
  summary TEXT,

  -- Source tracking
  source_platform TEXT NOT NULL,
  source_url TEXT,
  source_id TEXT,

  -- Classification
  topics TEXT[],
  content_type TEXT,
  status TEXT DEFAULT 'published',

  -- Embedding
  embedding vector(1536),

  -- Metadata
  author TEXT,
  published_at TIMESTAMPTZ,
  ingested_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

-- Indexes
CREATE INDEX content_items_embedding_idx
  ON content_items USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX content_items_platform_idx ON content_items (source_platform);
CREATE INDEX content_items_status_idx ON content_items (status);
CREATE INDEX content_items_topics_idx ON content_items USING GIN (topics);
CREATE UNIQUE INDEX content_items_source_unique_idx
  ON content_items (source_platform, source_id)
  WHERE source_id IS NOT NULL;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER content_items_updated_at
  BEFORE UPDATE ON content_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

- [ ] Create `ingestion_runs` table for tracking:

```sql
CREATE TABLE ingestion_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_platform TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  items_processed INT DEFAULT 0,
  items_added INT DEFAULT 0,
  status TEXT DEFAULT 'running',
  error TEXT
);
```

- [ ] Create RPC function for semantic search:

```sql
CREATE OR REPLACE FUNCTION content_search(
  query_embedding vector(1536),
  match_count INT DEFAULT 10,
  filter_platform TEXT[] DEFAULT NULL,
  filter_topics TEXT[] DEFAULT NULL,
  filter_status TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  body TEXT,
  summary TEXT,
  source_platform TEXT,
  source_url TEXT,
  topics TEXT[],
  status TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ci.id,
    ci.title,
    ci.body,
    ci.summary,
    ci.source_platform,
    ci.source_url,
    ci.topics,
    ci.status,
    1 - (ci.embedding <=> query_embedding) AS similarity
  FROM content_items ci
  WHERE
    (filter_platform IS NULL OR ci.source_platform = ANY(filter_platform))
    AND (filter_topics IS NULL OR ci.topics && filter_topics)
    AND (filter_status IS NULL OR ci.status = filter_status)
    AND ci.embedding IS NOT NULL
  ORDER BY ci.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

- [ ] Set up API keys (anon key for client, service role for MCP server)
- [ ] Test with sample data insert

### Deliverables
- Supabase project URL
- Database schema deployed
- API keys stored securely

---

## Phase 2: MCP Server

**Owner**: Codex (backend)
**Effort**: 4-6 hours
**Location**: New repo `@indexingco/content-mcp` or folder in Cortex

### Tasks

- [ ] Initialize Node.js/TypeScript project
- [ ] Add MCP SDK dependency
- [ ] Implement Supabase client connection
- [ ] Implement embedding generation (OpenAI text-embedding-3-small)
- [ ] Implement tools:

```typescript
// Tools to implement

content_search({
  query: string,
  filters?: {
    platform?: string[],
    topics?: string[],
    status?: string,
  },
  limit?: number,
}) → ContentItem[]

content_get({
  id: string
}) → ContentItem | null

content_upsert({
  title?: string,
  body: string,
  source_platform: string,
  source_url?: string,
  source_id?: string,
  topics?: string[],
  status?: string,
  metadata?: object,
}) → { id: string, created: boolean }

content_list({
  platform?: string,
  status?: string,
  limit?: number,
  offset?: number,
}) → ContentItem[]

content_similar({
  content_id: string,
  limit?: number,
}) → ContentItem[]

content_delete({
  id: string
}) → { success: boolean }
```

- [ ] Add error handling and validation
- [ ] Add rate limiting awareness
- [ ] Write tests
- [ ] Document tool interface

### Configuration

```json
// .env for MCP server
{
  "SUPABASE_URL": "https://xxx.supabase.co",
  "SUPABASE_SERVICE_KEY": "eyJ...",
  "OPENAI_API_KEY": "sk-..."
}
```

### Deliverables
- Working MCP server package
- Can run locally for testing
- Documented tool interface

---

## Phase 3: Cortex Integration

**Owner**: Claude (config) + Codex (if code needed)
**Effort**: 1-2 hours

### Tasks

- [ ] Add MCP server to Claude Code config:

```json
// In Claude Code MCP settings
{
  "mcpServers": {
    "content-db": {
      "command": "node",
      "args": ["/path/to/content-mcp/dist/index.js"],
      "env": {
        "SUPABASE_URL": "...",
        "SUPABASE_SERVICE_KEY": "...",
        "OPENAI_API_KEY": "..."
      }
    }
  }
}
```

- [ ] Test content_search from Cortex session
- [ ] Test content_upsert (create draft)
- [ ] Document usage patterns in `context/integrations.md`

### Example Workflow

```
User: "Find our best content about AI agents"

Cortex:
1. Calls content_search("AI agents", limit=5)
2. Returns top 5 matching items with similarity scores
3. Summarizes findings for user
```

```
User: "Draft a thread about this topic, save it"

Cortex:
1. Generates draft based on research
2. Calls content_upsert({
     body: "...",
     source_platform: "manual",
     status: "draft",
     topics: ["ai-agents"]
   })
3. Confirms: "Draft saved with ID xxx, visible in Marketing Tool"
```

### Deliverables
- MCP server configured in Cortex
- Tested and working
- Usage documented

---

## Phase 4: Ingestion Pipelines

**Owner**: User / Marketing Tool development
**Effort**: Variable (per platform)

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                 INGESTION LAYER                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Cron Jobs (Supabase Edge Functions or external)        │
│  ├── twitter-ingest: Fetch recent tweets                │
│  ├── linkedin-ingest: Fetch recent posts                │
│  └── youtube-ingest: Fetch video transcripts            │
│                                                         │
│  Webhooks                                               │
│  ├── Social platform webhooks (if available)            │
│  └── Manual trigger endpoints                           │
│                                                         │
│  Direct Upsert                                          │
│  ├── Cortex via MCP (content_upsert)                    │
│  └── Marketing Tool via REST API                        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Per-Platform Notes

**Twitter/X**:
- API access via Twitter API v2
- Fetch user timeline, filter by engagement
- Extract thread structure if applicable

**LinkedIn**:
- More restricted API
- May need scraping or manual export
- Consider LinkedIn API partner access

**YouTube**:
- YouTube Data API for video metadata
- Transcripts via youtube-transcript library or Whisper
- Store video summary + full transcript

### Shared Pipeline Logic

```typescript
async function ingestContent(items: RawContent[], platform: string) {
  const runId = await startIngestionRun(platform);

  for (const item of items) {
    // Check for duplicates
    const existing = await findBySourceId(platform, item.id);
    if (existing) continue;

    // Generate embedding
    const embedding = await embedText(item.text);

    // Upsert to DB
    await supabase.from('content_items').upsert({
      source_platform: platform,
      source_id: item.id,
      source_url: item.url,
      body: item.text,
      title: item.title,
      embedding,
      published_at: item.publishedAt,
      metadata: item.metadata
    });
  }

  await completeIngestionRun(runId, items.length);
}
```

### Deliverables
- At least one working ingestion pipeline
- Ingestion run tracking
- Deduplication logic

---

## Phase 5: Marketing Tool UI

**Owner**: Separate project
**Effort**: Significant (full app)

### Scope (Out of Cortex)

- Web app for content management
- Uses same Supabase backend via REST API
- Features:
  - Browse/search content
  - Edit drafts
  - Schedule publishing
  - Analytics dashboard
  - User management (Supabase Auth)

### Integration Points

- Shares `content_items` table with Cortex
- Drafts created by Cortex appear in Marketing Tool
- Published content from Marketing Tool searchable by Cortex

---

## Timeline

| Phase | Owner | Estimate | Dependencies |
|-------|-------|----------|--------------|
| 1. Database Setup | User | 1-2 hours | None |
| 2. MCP Server | Codex | 4-6 hours | Phase 1 |
| 3. Cortex Integration | Claude/Codex | 1-2 hours | Phase 2 |
| 4. Ingestion Pipelines | User/Marketing | Ongoing | Phase 1 |
| 5. Marketing Tool | Separate | Separate project | Phase 1 |

**MVP Path**: Phases 1-3 give Cortex working content search/upsert.

---

## Open Questions

1. **Embedding model**: Confirm text-embedding-3-small or alternative?
2. **MCP server location**: Separate repo or folder in Cortex?
3. **First ingestion source**: Twitter? Manual? YouTube?
4. **Marketing Tool timeline**: Parallel or after Cortex integration?

---

## Success Criteria

- [ ] Can search Indexing Co content from Cortex session
- [ ] Can save drafts from Cortex to shared DB
- [ ] Drafts visible in Marketing Tool (or direct DB query)
- [ ] At least one automated ingestion pipeline running
