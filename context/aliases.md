# Aliases

Personal shorthand that reduces typing AND tokens. Cortex understands these aliases in all interactions.

---

## Active Aliases

| Alias | Expands To | Category | Added | Usage |
|-------|-----------|----------|-------|-------|
| `gm` | good morning / run morning briefing | command | 2026-02-02 | core |
| `eod` | end of day / run daily digest | command | 2026-02-03 | core |
| `wip` | work in progress | status | 2026-02-03 | core |
| `afk` | away from keyboard | status | 2026-02-03 | core |

---

## Suggested Aliases

*Cortex adds suggestions here when it detects repeated patterns. Move to Active after approval.*

| Suggested | Expands To | Times Seen | First Seen | Approve? |
|-----------|-----------|------------|------------|----------|
<!-- Example: | `ixco` | Indexing Co | 5 | 2026-02-03 | [ ] -->

---

## Alias Categories

| Category | Description | Examples |
|----------|-------------|----------|
| **command** | Triggers a skill or action | `gm`, `eod`, `prep` |
| **entity** | Shorthand for people, companies, projects | `ixco` -> Indexing Co |
| **phrase** | Common expressions | `lgtm` -> looks good to me |
| **path** | File/folder shortcuts | `ctx` -> context/ |
| **status** | State indicators | `wip`, `blocked`, `done` |

---

## Rules

1. **Aliases are case-insensitive** -- `gm`, `GM`, `Gm` all work
2. **Context-aware expansion** -- `prep` alone means "what should I prep for?" but `prep [name]` expands to "prepare for meeting with [name]"
3. **Composable** -- `gm + focus` could mean "morning briefing but only the focus section"
4. **Never auto-create** -- Cortex suggests, Dennis approves
5. **Track usage** -- popular aliases stay, unused ones get pruned

---

## Detection Criteria

Cortex should suggest an alias when:
- A phrase of 3+ words appears 3+ times in a week
- User misspells the same thing consistently (suggest the correct expansion)
- A command pattern emerges (e.g., user always says "what's on my calendar" -> suggest `cal`)

---

## How Cortex Uses Aliases

1. **Input expansion**: When Dennis types an alias, Cortex expands it before processing
2. **Output compression**: In verbose contexts, Cortex can use established aliases
3. **Prompt efficiency**: System prompts reference aliases instead of full phrases
4. **Pattern detection**: Track phrase frequency to generate suggestions

---

*Last reviewed: 2026-02-03*
