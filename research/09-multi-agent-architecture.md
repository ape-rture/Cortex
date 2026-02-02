# Multi-Agent Architecture: Contrasting Approaches

Two contrasting perspectives on multi-agent systems -- one arguing against, one providing a detailed implementation guide.

---

## Source 1: Against Multi-Agent Systems

- **Author:** Cognition AI (makers of Devin)
- **Title:** "Don't Build Multi-Agents"
- **URL:** https://cognition.ai/blog/dont-build-multi-agents

### Core Argument

Running multiple agents in collaboration produces fragile systems due to dispersed decision-making. Most teams would be better served by simpler architectures.

### Principle 1: Share Context

- Share full agent traces, not just individual messages
- Without complete context, subagents misunderstand tasks
- The cost of re-deriving context is higher than the cost of sharing it

### Principle 2: Actions Carry Implicit Decisions

- Every action an agent takes embeds assumptions and decisions
- When parallel agents cannot see each other's work, they make conflicting assumptions
- These conflicts compound and create subtle, hard-to-debug failures

### Recommended Alternatives

1. **Single-threaded linear agents** (simplest) -- one agent, one thread, sequential execution
2. **Hierarchical compression** -- an LLM compresses conversation history into key decisions for long-running tasks, preserving context without exceeding windows

### Notable Examples

- Claude Code itself uses subagents only for answering questions, not for writing code in parallel
- The trend toward "Edit Apply Models" -- single models handling both decision and execution rather than splitting across agents

### When Multi-Agent Might Work

- The blog does not say "never" -- it says the bar should be high
- Only when tasks are truly independent and do not share implicit state

---

## Source 2: Pro Multi-Agent Implementation

- **Author:** @pbteja1998 (Bhanu Teja P)
- **Title:** "The Complete Guide to Building Mission Control: How We Built an AI Agent Squad"
- **URL:** https://x.com/pbteja1998/status/2017662163540971756

### Architecture Overview

10 AI agents, each as a separate Clawdbot session with its own identity, memory, and schedule, coordinated through a shared Mission Control system.

### Agent Roster

| Agent | Role |
|-------|------|
| Jarvis | Lead / Orchestrator |
| Shuri | Product Analyst |
| Fury | Researcher |
| Vision | SEO Specialist |
| Loki | Writer |
| Quill | Social Media |
| Wanda | Designer |
| Pepper | Email Marketing |
| Friday | Developer |
| Wong | Documentation |

### Session Architecture

- Each agent runs as an independent Clawdbot session with a unique session key
- Sessions maintain their own history, context, and memory
- A gateway manages all sessions and routes messages between them
- Sessions are independent by design -- isolation prevents cascading failures

### SOUL System

- Each agent has a detailed SOUL.md personality file
- SOUL files define the agent's expertise, communication style, priorities, and constraints
- This makes each agent a genuine specialist rather than a generic assistant with a label

### Memory Stack (Per Agent)

1. **Session Memory** -- Clawdbot JSONL conversation history
2. **Working Memory** -- WORKING.md for current task state
3. **Daily Notes** -- what happened today
4. **Long-term Memory** -- MEMORY.md for persistent knowledge

### Heartbeat System

- Agents wake every 15 minutes via staggered cron jobs
- Cost-efficient: agents only consume resources when active
- Staggering prevents resource contention and API rate limiting

### Mission Control: Coordination Layer

- Built on a shared Convex database
- Provides: tasks, comments, activity feed, notifications, documents
- @Mentions enable targeted agent-to-agent communication
- Thread subscriptions let agents follow relevant conversations

### Task Lifecycle

```
Inbox -> Assigned -> In Progress -> Review -> Done -> Blocked
```

### Daily Standup

- Runs at 11:30 PM
- Summarizes all agent activity from the day
- Creates a unified view of progress across all agents

### Lessons Learned

- **Start smaller:** Begin with 2-3 agents, not 10
- **Use cheaper models for routine work:** Heartbeat checks and simple status updates do not need the most capable model
- **Memory is hard:** Put everything in files rather than trying to maintain state in memory
- **Let agents surprise you:** Emergent behaviors from well-defined agents can be more valuable than rigidly scripted workflows

---

## Synthesis: What Makes Sense for a Personal Assistant

### Where Cognition AI Is Right

- Context sharing is genuinely the hardest problem in multi-agent systems
- Parallel agents making conflicting assumptions is a real failure mode
- Simpler architectures should be the default starting point
- Most tasks do not actually require multiple agents

### Where the Mission Control Approach Adds Value

- Specialized agents with distinct SOUL files produce higher quality output in their domains
- The heartbeat pattern is cost-efficient and practical
- File-based memory (WORKING.md, MEMORY.md) is more robust than in-memory state
- The task lifecycle provides clear coordination without requiring agents to share full context

### Reconciliation for Our Personal Assistant

1. **Start single-agent.** The personal assistant should be one agent that can handle most tasks directly. This aligns with Cognition's recommendation.

2. **Use sub-agents for isolated, well-defined tasks.** When a task is truly independent (research, analysis, drafting), a sub-agent can handle it. But follow the temp folder pattern from research note 07 -- sub-agents write to files, the main agent reads as needed.

3. **The SOUL pattern is valuable even without multi-agent.** Defining clear personality and expertise files for different modes of operation (research mode, writing mode, coding mode) can improve output quality without the complexity of separate agent processes.

4. **File-based memory is the right default.** Both approaches agree that persistent state belongs in files, not in agent memory. WORKING.md, MEMORY.md, and daily notes are good patterns regardless of agent count.

5. **If scaling to multiple agents, use the Mission Control patterns.** Staggered heartbeats, shared database for coordination, @mentions for communication, and clear task lifecycles are proven patterns.

6. **The hybrid approach:** One primary agent with the ability to spawn temporary sub-agents for specific tasks, using file-based communication (not context injection) between them. This captures the benefits of specialization without the fragility of full multi-agent coordination.

---

## Key Takeaways

1. **Default to simplicity.** Single-agent or single-threaded architectures should be the starting point. Add agents only when you have proven the need.

2. **Context is king.** Whether single or multi-agent, the system that shares context most effectively wins. File-based context sharing (temp folders, shared documents) is more robust than passing context through agent conversations.

3. **Identity improves quality.** The SOUL.md pattern -- giving agents clear personalities, expertise areas, and constraints -- produces better output even in single-agent systems. Consider this for different operational modes.

4. **Memory belongs in files.** Both approaches converge on file-based memory as the right abstraction. Session memory, working memory, and long-term memory should all be persisted to disk.

5. **Cost management matters.** The heartbeat pattern (staggered cron, cheaper models for routine checks) is practical wisdom for any system that runs agents continuously.

6. **Start with 1, scale to 2-3, then evaluate.** Do not jump to 10 agents. Build one solid agent, add a second when you hit clear limitations, and grow from there based on demonstrated need.
