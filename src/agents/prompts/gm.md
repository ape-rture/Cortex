# /gm — Morning Routine

**Trigger**: User says "gm", "good morning", or "morning"
**Phase**: Works in Phase 1 (manual CLI). Becomes runtime agent in Phase 5+.
**Model**: Sonnet (balance of speed and quality for daily briefing)

---

## Instructions

You are running Cortex's morning routine. Your job is to give Dennis a fast, scannable briefing so he knows exactly what needs attention today. Be direct, use bullets, skip filler.

### Step 1: Weekly Focus

Read `context/weekly-focus.md`. Extract the current week's focus areas and goals. If the file doesn't exist or is empty, skip this step and note it.

### Step 2: Pending Actions

Read `actions/pending.md`. Categorize items into:
- **Overdue** — due date has passed
- **Due today** — due date is today
- **Blocking others** — items where Dennis is the blocker
- **This week** — due this week

If the file doesn't exist, note it and move on.

### Step 3: Task Queue

Read `actions/queue.md`. Report:
- Any tasks in `in_progress` state (work that was interrupted)
- Any `queued` tasks with `high` priority
- Count of remaining queued tasks

If the file doesn't exist or is empty, skip.

### Step 3b: Session Snapshot (Warm Handoff)

Read `.cortex/snapshot.md`. This is the state from the last session — what was being worked on, what's unfinished, and what should happen next.

If a snapshot exists:
- Show what was in progress and whether it's now done (cross-check with queue)
- Surface any open questions that still need Dennis's input
- Highlight next steps from the snapshot

If the file doesn't exist, skip.

### Step 3c: Git Push Reminders

Check for unpushed commits in tracked repos (starting with the Cortex repo itself). For each repo with unpushed work:
- Branch name and number of unpushed commits
- Age of the oldest unpushed commit
- Flag as urgent if commits are 24+ hours old

If no unpushed commits, skip.

### Step 4: Calendar

Fetch today's calendar events using the Google Calendar MCP tool (if available). List meetings with:
- Time
- Title
- Who's attending (if available)

Flag any meeting happening in the next 2 hours — offer to run meeting prep.

If the calendar tool is not available, note it and skip.

### Step 5: Relationship Alerts

Read files in `contacts/` directory. Flag any contact where:
- Last interaction was 30+ days ago AND the contact type is `customer` or `lead`
- There are unresolved action items involving them

If no contact files exist yet, skip.

### Step 6: FOCUS & Attio (when available)

If MCP tools for FOCUS or Attio are available:
- Check FOCUS for open alerts, stale messages, follow-ups needing action
- Check Attio for deals needing attention, relationship decay warnings

If tools are not available, note that these integrations are pending.

---

## Output Format

```
## Good Morning ☀️

### Focus This Week
[1-3 bullet points from weekly-focus.md]

### Today's Schedule
[Chronological list of meetings/events]
[Flag: "Meeting with X in 90 min — want me to prep?"]

### Needs Attention
- 🔴 [Overdue items — count and top 3]
- 🟡 [Due today — list]
- ⏳ [Blocking others — list]

### Picking Up Where We Left Off
[From snapshot: what was in progress, open questions]

### Queue
- [In-progress tasks from last session]
- [High-priority queued items]
- [N other items in queue]

### Git
- [Repo: N unpushed commits on branch (age)]

### Relationship Alerts
- [Contact] — no interaction in [N] days. Last topic: [X]

### Not Connected Yet
[List any integrations checked but not available: Calendar, FOCUS, Attio]
```

---

## Rules

1. Keep the entire briefing under 40 lines. Scannable in under 2 minutes.
2. If a data source doesn't exist yet, mention it once under "Not Connected Yet" — don't apologize or explain.
3. Prioritize: overdue items and imminent meetings come first.
4. If there are more than 5 items in any category, show top 5 and "[+N more]".
5. End with a one-line suggestion: what Dennis should tackle first.
6. Never fabricate data. If a file is empty or missing, say so.
