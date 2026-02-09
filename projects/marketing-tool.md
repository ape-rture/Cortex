# Project: Indexing Co Marketing Tool

**Status**: active
**Started**: 2026-02-09
**Target**: TBD (planning phase)
**Owner**: Dennis
**Registry ID**: indexing-co-marketing-tool
**Path**: D:\Documenten\Programmeren\Python\Cryptocurrency\The Indexing Company\Marketing Tool

## Goal

Build a content marketing web app for The Indexing Company. Manages content creation, scheduling, and publishing across X, LinkedIn, YouTube, and articles. Shares a Supabase backend with Cortex.

## Current State

Project scaffolded with collaboration template. Ready for planning and research phase.

## Prerequisites (from Cortex Content DB plan)

The Marketing Tool depends on Phase 1-3 of the content DB implementation plan:
1. **Phase 1**: Supabase project + schema setup (user task)
2. **Phase 2**: MCP Server for Cortex (codex task)
3. **Phase 3**: Cortex integration testing

The Marketing Tool itself is Phase 5. Phases 4 (ingestion pipelines) and 5 can run in parallel.

## Tech Stack

- Next.js (App Router), TypeScript, Supabase, Tailwind CSS

## Next Steps

1. Research competitive content marketing tools for feature inspiration
2. Define MVP scope (features, user flows, data model)
3. Design UI wireframes / component architecture
4. Set up Next.js project with Supabase connection
5. Decide on deployment target (Vercel / self-hosted)

## Key Decisions

- Content DB architecture: `decisions/2026-02-05-content-db-integration.md`
- Implementation plan: `decisions/2026-02-05-content-db-implementation-plan.md`

## Related

- Cortex content pipeline: `src/cli/content.ts`
- Content DB research: `research/13-content-db-architecture.md`

## Log

### 2026-02-09
Project scaffolded from collab template. SYSTEM.md created with architecture overview, tech stack, and feature outline. Registered in Cortex project registry as `indexing-co-marketing-tool`. Ready for planning phase.

---

*Update when significant progress is made.*
