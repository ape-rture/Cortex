# AI Project Manager Agents

## Source

- **Author:** @nityeshaga (Nityesh) - Applied AI Engineer
- **Title:** "How We Built an AI Project Manager Using Claude Code"
- **URL:** https://x.com/nityeshaga/status/2017128005714530780

---

## Overview

Nityesh and team built "Claudie," an internal AI project manager for their consulting business using Claude Code. The project demonstrates a real-world evolution from naive slash-command approaches through orchestrator patterns to a mature handbook-driven multi-agent system.

---

## The Problem

- Consulting business runs on Google Sheets -- up to 12 tables per client sheet
- Keeping sheets accurate and up to date is effectively a full person's job
- Need: automate project management workflows that span reading, updating, and coordinating across these sheets

---

## Architectural Approach

### Step 1: Write a Job Description First

- Before writing any code, they wrote a job description for a human project manager
- This framing guided every architectural decision -- the AI agent needed to fulfill the same role a human PM would

### Step 0: Build the Tools

- Google does not have an official MCP server for Workspace
- Key insight: MCP is just a wrapper on an API
- Used Claude Code's MCP Builder skill to build a Google Workspace MCP server from scratch

---

## Evolution Through Three Versions

### Version 1: Slash Commands (Failed)

- Direct MCP tool calls to read and write data
- **Failure mode:** MCP tools to read data were too expensive in context
- By the time the agent understood what was needed, it had run out of context window

### Version 2: Orchestrator + Sub-Agents

- Used Anthropic's Tasks feature to spawn sub-agents
- **Problem:** Main Claude context became overwhelmed when 10+ sub-agents returned detailed reports simultaneously
- All reports flooding back into the orchestrator's context created the same window pressure as V1

### Version 2.5: The Fix -- Shared Temp Folder

- Every sub-agent writes its report to a shared temporary folder instead of returning it to the orchestrator
- Orchestrator reads reports from the folder as needed
- Downstream sub-agents can read earlier reports directly from the folder
- This decouples report generation from context consumption

### Version 3: Skills to Handbook

- Instead of 11 separate narrow skill files, created one comprehensive handbook
- Handbook organized into chapters:
  - **Foundation** -- core concepts and conventions
  - **Daily Operations** -- routine tasks and workflows
  - **Client Dashboards** -- how to read and update client sheets
  - **New Clients** -- onboarding procedures
- Sub-agents read foundation chapters first, then task-specific chapters
- Single source of truth rather than fragmented skill definitions

---

## Stack Dependencies

- MCP Builder (October 2025)
- Opus 4.5 (November 2025)
- Tasks feature (January 2026)
- Both team members running out of Max plan usage limits on multiple days

---

## Notable Quote

"Claude Code for non-technical work will sweep 2026" -- if you give Claude Code tools for non-technical work and build a workflow covering how you use those tools, that is all you need.

---

## Key Takeaways

1. **Start with the human role definition.** Writing a job description for the human equivalent of your agent forces clarity on what the agent actually needs to do and what tools it needs access to.

2. **MCP is just an API wrapper.** Do not wait for official MCP servers. If an API exists, you can build the MCP server yourself using Claude Code's MCP Builder skill.

3. **Context window is the primary constraint.** Both V1 (too much read data) and V2 (too many sub-agent reports) failed due to context overflow. Every architectural decision must account for context budget.

4. **Decouple agent outputs from orchestrator context.** The shared temp folder pattern is critical -- sub-agents write to files, and only the needed information gets read into context. This is the single most important architectural pattern for multi-agent systems.

5. **Consolidate skills into a handbook.** A single well-organized document with chapters is more effective than many small skill files. Agents can selectively read the chapters they need, and the structure mirrors how a human would use an operations manual.

6. **Non-technical automation is the frontier.** The combination of Claude Code + domain-specific tools + workflow documentation enables automation of traditionally human-only knowledge work like project management.

7. **For our Personal Assistant:** The temp folder pattern for sub-agent communication and the handbook approach for organizing operational knowledge are directly applicable. Consider structuring our agent's knowledge as a handbook with foundation chapters that all sub-agents read first.
