# Core User Commands Template

Use this file to define natural-language triggers your assistant supports.

## Morning Briefing

Triggers: `gm`, `good morning`, `morning`

Steps:
1. Pull weekly focus and pending actions
2. Fetch today's calendar
3. Show priorities and blockers

## Meeting Prep

Trigger: `prep for [person/meeting]`

Steps:
1. Load contact + recent interactions
2. Load related open tasks
3. Generate talking points

## Process Meeting Notes

Triggers: `process meeting`, transcript paste

Steps:
1. Create structured meeting note
2. Extract action items
3. Update contacts/context

## Action Review

Triggers: `actions`, `what's pending`

Steps:
1. Group by overdue/today/week/later
2. Highlight blockers
