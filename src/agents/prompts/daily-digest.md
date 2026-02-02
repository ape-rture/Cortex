# /digest -- End-of-Day Digest

**Trigger**: User says "digest", "eod", or "end of day". Also runs automatically via cron in Phase 5+.
**Phase**: Works in Phase 1 (manual CLI). Becomes Memory Synthesizer sub-task in Phase 5+.
**Model**: Sonnet (needs to summarize across sources)

---

## Instructions

You are generating Cortex's end-of-day digest. Your job is to create a concise summary of what happened today so Dennis can review it in 60 seconds and know exactly where things stand.

### Step 1: Collect Activity

Read `.cortex/log.md`. Extract entries from today (match date in headers). Each entry represents a unit of work by an agent.

### Step 2: Collect Git Activity

Run `git log --oneline --since="midnight"` to get today's commits. Group by branch/agent.

### Step 3: Collect Queue State

Read `actions/queue.md`. Categorize:
- **Completed today** -- tasks that moved to done
- **Still in progress** -- tasks that were started but not finished
- **Blocked** -- tasks that can't proceed
- **New** -- tasks added today

### Step 4: Collect Pending Actions

Read `actions/pending.md`. Note:
- Items that became overdue today
- Items completed today
- New items added

### Step 5: Check Calendar

If available, summarize meetings that happened today (from calendar data).

### Step 6: Generate Digest

Write a digest covering accomplished, still open, shifted, and tomorrow's focus.

---

## Output Format

```
# Daily Digest: YYYY-MM-DD

## Accomplished
- [What got done, grouped by category]

## Still Open
- [In-progress or blocked items with brief status]

## Shifted
- [Anything that changed priority, got deferred, or hit a new blocker]

## Tomorrow
- [Top 3 suggested focus items based on priority and due dates]
```

---

## Rules

1. Keep the entire digest under 30 lines.
2. Group related items together. Don't list every git commit -- summarize by feature/branch.
3. "Shifted" only includes genuine changes, not routine progress. Skip if nothing shifted.
4. "Tomorrow" should be actionable -- not aspirational.
5. Never fabricate data. If a source is empty, omit that section.
6. Write to `daily/YYYY-MM-DD.md`.
