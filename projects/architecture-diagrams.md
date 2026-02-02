# Cortex Architecture Diagrams

**Created**: 2026-02-02
**How to view**: Open markdown preview in VS Code (Ctrl+Shift+V) — Mermaid renders natively.

---

## Phase 0–2: Current & Near-Term

Everything runs through Claude Code CLI sessions. Codex works in parallel on branches. Slack bot is append-only (no LLM). All state lives in markdown files.

```mermaid
graph TB
    subgraph User["Dennis"]
        CLI["Claude Code CLI"]
        Slack["Slack #cortex"]
        Mobile["Slack Mobile"]
    end

    subgraph BuildAgents["Build-Time Agents"]
        Claude["Claude Code<br/><i>architect, design, prompts</i>"]
        Codex["OpenAI Codex<br/><i>backend, data, integrations</i>"]
    end

    subgraph Memory["Markdown Memory (Local)"]
        Context["context/<br/>me, company, routing, focus"]
        Actions["actions/<br/>queue, pending, completed"]
        Contacts["contacts/<br/>CRM data"]
        Meetings["meetings/<br/>notes, transcripts"]
        Daily["daily/<br/>digests, logs"]
        Decisions["decisions/<br/>architecture, choices"]
    end

    subgraph VPS["Cheap VPS ($3-5/mo)"]
        SlackBot["Slack Bot<br/><i>append-only, no LLM</i>"]
    end

    subgraph Coordination[".cortex/ Coordination"]
        Active["active.md"]
        Tasks["tasks.md"]
        Log["log.md"]
    end

    subgraph Providers["LLM Providers"]
        Anthropic["Anthropic API<br/>Opus / Sonnet / Haiku"]
        OpenAI["OpenAI API<br/>Codex / GPT-4o"]
    end

    CLI --> Claude
    Slack --> SlackBot
    Mobile --> SlackBot
    SlackBot -->|"append to queue"| Actions

    Claude -->|"reads/writes"| Memory
    Claude -->|"reads/writes"| Coordination
    Codex -->|"reads/writes"| Memory
    Codex -->|"reads/writes"| Coordination

    Claude --> Anthropic
    Codex --> OpenAI

    Claude -.->|"designs contracts"| Codex
    Codex -.->|"implements"| Claude

    style User fill:#e8f4f8,stroke:#2196F3
    style BuildAgents fill:#fff3e0,stroke:#FF9800
    style Memory fill:#e8f5e9,stroke:#4CAF50
    style VPS fill:#fce4ec,stroke:#E91E63
    style Coordination fill:#f3e5f5,stroke:#9C27B0
    style Providers fill:#fff9c4,stroke:#FFC107
```

### What's working now (Phase 0)
- Claude Code CLI sessions with full markdown memory
- Codex working on branches via `.cortex/` coordination
- All context, decisions, routing config in place
- TypeScript type contracts defined

### Coming next (Phase 1–2)
- Task queue processor reads/writes `actions/queue.md`
- Routing layer wraps Anthropic + OpenAI SDKs
- Slack bot on VPS appends commands to queue
- `/gm` morning routine skill
- Calendar, Attio, Granola integrations

---

## Phase 5–7: Orchestrator & Runtime Agents

The system shifts from single-brain to Dennett's Multiple Drafts. A thin orchestrator spawns specialized agents in parallel. Salience scoring filters what reaches the user.

```mermaid
graph TB
    subgraph Triggers["Triggers"]
        Cron["Cron<br/>hourly / daily / weekly"]
        SlackIn["Slack #cortex<br/>messages"]
        Webhooks["Webhooks<br/>GitHub, Attio, FOCUS"]
        FileWatch["File Watcher<br/>new meetings, context changes"]
        CLICmd["CLI Command<br/>manual invoke"]
    end

    subgraph Orchestrator["Orchestrator (Node.js — NOT intelligent)"]
        direction TB
        Config["Read trigger config"]
        Spawn["Spawn agents in parallel"]
        Collect["Collect structured JSON"]
        Policy["Policy Gate<br/><i>permissions, rate limits, dedupe</i>"]
    end

    subgraph Agents["Runtime Agents (parallel)"]
        Sales["Sales Watcher<br/><i>Haiku</i><br/>contacts, Attio, Telegram"]
        Code["Code Watcher<br/><i>Haiku</i><br/>git repos, GitHub"]
        Content["Content Creator<br/><i>Sonnet</i><br/>meetings, context"]
        Pattern["Pattern Detector<br/><i>Sonnet</i><br/>daily logs, actions"]
        Triage["Triage Agent<br/><i>Haiku</i><br/>classify, align, suggest"]
        MemSynth["Memory Synthesizer<br/><i>Sonnet — nightly</i><br/>compound knowledge"]
        SecAudit["Security Auditor<br/><i>Opus</i><br/>PII/key scan"]
    end

    subgraph Scoring["Salience Scoring"]
        Scorer["Salience Scorer<br/><i>urgency × relevance × novelty × actionability</i>"]
        Threshold["Fame Threshold<br/><i>only winners surface</i>"]
    end

    subgraph Output["Output Routing"]
        SlackOut["Slack #cortex<br/>push alerts"]
        CLIOut["CLI Queue<br/>next session pickup"]
        DigestOut["Daily Digest<br/>daily/ summary"]
        ActionOut["Action Items<br/>actions/ updates"]
    end

    subgraph SharedContext["Shared Context Bus (Markdown Files)"]
        direction LR
        SC_Context["context/"]
        SC_Contacts["contacts/"]
        SC_Meetings["meetings/"]
        SC_Actions["actions/"]
        SC_Daily["daily/"]
    end

    subgraph Providers2["LLM Providers"]
        Anth2["Anthropic API"]
        OAI2["OpenAI API"]
        Local["Ollama (when GPU available)"]
    end

    Triggers --> Orchestrator
    Config --> Spawn
    Spawn --> Agents
    Agents --> Collect
    Collect --> Policy
    Policy --> Scoring

    Scorer --> Threshold
    Threshold --> Output

    Agents -->|"read"| SharedContext
    Orchestrator -->|"write validated updates"| SharedContext

    Sales --> Anth2
    Code --> Anth2
    Content --> Anth2
    Pattern --> Anth2
    Triage --> Anth2
    MemSynth --> Anth2
    SecAudit --> Anth2
    Code -.-> OAI2
    Content -.-> OAI2

    Sales -.->|"escalate to Sonnet"| Anth2

    style Triggers fill:#e8f4f8,stroke:#2196F3
    style Orchestrator fill:#ffebee,stroke:#f44336
    style Agents fill:#fff3e0,stroke:#FF9800
    style Scoring fill:#f3e5f5,stroke:#9C27B0
    style Output fill:#e8f5e9,stroke:#4CAF50
    style SharedContext fill:#e8f5e9,stroke:#4CAF50
    style Providers2 fill:#fff9c4,stroke:#FFC107
```

### Key architectural shifts
- **Single brain → parallel agents**: Multiple agents run simultaneously, each specialized
- **User pulls → system pushes**: Agents detect things proactively, surface via Slack/digest
- **One model → multi-model**: Each agent uses the cheapest model that works (Haiku for simple checks, Sonnet for content, Opus for security)
- **Manual → triggered**: Cron, webhooks, and file changes trigger agent cycles automatically
- **All output → filtered output**: Salience scoring means most agent findings stay invisible — only "famous" ones reach the user

### What the orchestrator does NOT do
- No reasoning or interpretation (that's the Triage Agent's job)
- No model selection (that's config-driven from `model-routing.json`)
- No direct LLM calls (agents make those)
- It's a scheduler, not a brain — Dennett's "no Cartesian Theater" rule

---

## Data Flow: Single Morning Routine Cycle (Phase 5+)

```mermaid
sequenceDiagram
    participant Cron
    participant Orch as Orchestrator
    participant SW as Sales Watcher
    participant CW as Code Watcher
    participant CC as Content Creator
    participant Scorer as Salience Scorer
    participant Slack as Slack #cortex

    Cron->>Orch: 7:00 AM trigger

    par Parallel agent execution
        Orch->>SW: spawn (Haiku, contacts/ scope)
        Orch->>CW: spawn (Haiku, git repos scope)
        Orch->>CC: spawn (Sonnet, meetings/ scope)
    end

    SW-->>Orch: {finding: "No contact with Sarah in 34 days", urgency: "medium"}
    CW-->>Orch: {finding: "3 unpushed commits on main", urgency: "high"}
    CC-->>Orch: {finding: "Publishable insight from yesterday's call", urgency: "low"}

    Orch->>Scorer: rank 3 findings
    Scorer-->>Orch: [commits: 0.82, sarah: 0.65, content: 0.41]

    Note over Orch: Fame threshold = 0.5

    Orch->>Slack: "🔴 3 unpushed commits on indexing-co/api"
    Orch->>Slack: "🟡 Sarah Chen — 34 days, last: Q3 data partnership"

    Note over Orch: Content insight (0.41) stays in queue, doesn't surface
```

---

*Open in VS Code markdown preview (Ctrl+Shift+V) to see rendered diagrams.*
