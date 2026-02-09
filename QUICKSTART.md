# Quick Start

## Daily Commands

| Say this | I'll do this |
|----------|--------------|
| "gm" / "good morning" | Morning briefing: calendar, priorities, pending actions |
| "prep for [meeting/person]" | Pull context, history, suggest talking points |
| [paste Granola link] | Fetch notes, create meeting record, extract actions |
| "actions" or "what's pending" | Show all pending action items grouped by urgency |
| "remind me to [thing]" | Add to pending actions |
| "done with [item]" | Mark complete, move to completed log |
| "log decision about [X]" | Create decision record with context |
| "what was I doing with [X]" | Pull recent context for person/project |

## After Meetings

Just paste the Granola link. I'll:
1. Fetch the transcript/notes
2. Create a meeting note
3. Extract action items
4. Update relevant contact files
5. Flag anything to sync to Attio

## Weekly Rhythm

**Monday morning**: Update `context/weekly-focus.md` with top priorities
**Daily**: Say "good morning" to get briefing
**After meetings**: Paste Granola links
**End of week**: Review completed actions, update weekly focus

## Tips

- **Fast context switch**: "What was I doing with [person]?"
- **Batch small tasks**: "What small tasks can I knock out in 15 mins?"
- **Before 1:1s**: "Prep for 1:1 with [name]"
- **Track everything**: Just mention things naturally, I'll capture them

## Web Terminal

Start the browser UI:

```bash
npm run dev:ui
```

Open [http://localhost:8787](http://localhost:8787). Available commands:

| Command | What it does |
|---------|--------------|
| `/gm` | Morning briefing |
| `/gm <question>` | Briefing + LLM follow-up (hybrid mode) |
| `/digest` | End-of-day digest |
| `/prep <name>` | Meeting prep brief |
| `/content` | Content pipeline overview |
| `/content list` | List all content ideas |
| `/content draft <id>` | Generate a draft for an idea |
| `/content seeds` | Show unprocessed content seeds |
| `/orchestrate [flags]` | Run orchestrator cycle (`--history`, `--verbose`, `--cron`) |
| `/tasks` | Show task queue |
| `/contacts <query>` | Search contacts |
| `/snapshot` | Last session snapshot |

Anything not starting with `/` goes to the LLM via ConfigRouter.

Set `UI_PORT` to change the port (default 8787).

## First Steps

1. Fill in `context/company.md` with your company info
2. Add your 5 team members to `team/roster.md`
3. Update `context/weekly-focus.md` with this week's priorities
4. Tomorrow, start with "good morning"

---

*See SYSTEM.md for full documentation.*
