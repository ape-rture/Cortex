# Compound Engineering: Self-Improving Agent Loops

## Source

- **Author:** @ryancarson (Ryan Carson)
- **Title:** "How to make your agent learn and ship while you sleep"
- **URL:** https://x.com/ryancarson/status/2016520542723924279

---

## Overview

A nightly automation loop where an AI agent reviews the day's work, extracts lessons, updates its own instructions, and then picks up the next feature from a backlog -- all while the developer sleeps. The system is built on three open-source projects and demonstrates a practical self-improving agent architecture.

---

## Foundation: Three Open-Source Projects

1. **Compound Engineering Plugin** (by @kieranklaassen) -- the review and learning extraction layer
2. **Compound Product** -- the automation layer that ties scheduling to agent execution
3. **Ralph** -- the autonomous agent loop that handles implementation

---

## The Two-Part Nightly Loop

### Part 1: Compound Review (10:30 PM)

- Reviews all agent threads/sessions from the last 24 hours
- Extracts learnings and patterns from successes and failures
- Updates AGENTS.md with new insights and rules
- This step ensures institutional knowledge is captured before the next implementation run

### Part 2: Auto-Compound (11:00 PM)

- Pulls latest code (now including the freshly updated AGENTS.md)
- Picks the #1 priority item from the reports/backlog
- Implements the feature or fix
- Creates a pull request

### Why Order Matters

- The review job runs first and updates AGENTS.md
- The implementation job runs second and benefits from those freshly extracted learnings
- Each night's implementation is informed by every previous night's lessons

---

## Implementation Pipeline

```
Report -> PRD -> Tasks -> Implementation -> PR
```

The agent transforms a high-level report or feature request through progressive refinement: product requirements document, then discrete tasks, then code implementation, then a reviewable pull request.

---

## Claude Code Compatibility

Works with Claude Code by replacing the execution command:

```
claude -p "..." --dangerously-skip-permissions
```

This enables the same nightly loop pattern with Claude Code as the underlying agent.

---

## Scheduling and System Setup

- Uses **launchd** on macOS for scheduling (preferred over cron for reliability)
- Keep Mac awake with `caffeinate` during the automation window (5 PM - 2 AM)
- Scheduling ensures the two jobs run in sequence with a gap between them

---

## Extension Ideas

- **Slack notifications** -- alert the team when PRs are created or issues found
- **Multiple priority tracks** -- run different agents on different backlogs
- **Automatic PR merge** -- if CI passes, merge without human intervention
- **Weekly changelog** -- auto-generate summaries of all changes made

---

## Core Principle

"Self-improving loop -- every unit of work makes future work easier. AGENTS.md files become institutional memory."

The system creates a compounding effect: each cycle of work produces not just code but also knowledge that makes the next cycle more effective. Over time, the AGENTS.md files accumulate a rich understanding of the codebase, common pitfalls, and effective patterns.

---

## Key Takeaways

1. **The self-improving loop is the key pattern.** The combination of "review past work -> extract learnings -> update instructions -> do new work" creates compounding returns. Each cycle makes the agent more capable.

2. **Separate review from implementation.** Running the review step before the implementation step ensures that lessons are captured and available before new work begins. This is a simple but powerful sequencing decision.

3. **AGENTS.md as institutional memory.** Treating the agent's instruction file as a living document that the agent itself updates creates a feedback loop. The agent writes rules for itself based on what it has learned.

4. **Scheduling enables autonomy.** Using system schedulers (launchd, cron) to trigger agent runs means work happens without human initiation. The developer's role shifts from doing work to reviewing completed PRs.

5. **The pipeline matters.** Going from report to PRD to tasks to implementation to PR is not just bureaucracy -- each stage constrains and focuses the next, reducing errors and improving output quality.

6. **For our Personal Assistant:** The compound review pattern is directly applicable. We should implement a regular review cycle where the assistant examines its recent performance, extracts learnings, and updates its own operational documents. The AGENTS.md pattern maps to our CLAUDE.md and skill files -- they should be treated as living documents the assistant can improve based on experience.

7. **Start simple, compound over time.** The initial setup is straightforward (two scheduled jobs), but the value compounds as the AGENTS.md accumulates learnings. Do not over-engineer the first version -- let the compounding effect do the work.
