# Research Notes: Clawdbot / OpenClaw as a Personal AI Assistant

## Sources

- **Source 1:** @YJstacked -- "How I Turned ClawdBot Into My 24/7 Personal Assistant"
  [https://x.com/YJstacked/status/2015310588713500840](https://x.com/YJstacked/status/2015310588713500840)
- **Source 2:** @0x5am5 (Samuel Gregory) -- Setup tip for Max plan users
  [https://x.com/0x5am5/status/2015517192532488493](https://x.com/0x5am5/status/2015517192532488493)
- **Source 3:** @kichsr (Krishna) -- Lightweight setup alternative
  [https://x.com/kichsr/status/2018122583451881484](https://x.com/kichsr/status/2018122583451881484)

---

## What Is Clawdbot / OpenClaw?

- Open-source AI agent framework released under the **MIT license**
- Created by **Peter Steinberger / Velvet Shark**
- Core purpose: bridges messaging apps to AI models, turning them into a persistent personal assistant
- Acts as a middleware layer -- you talk to it through your preferred chat app and it routes to whichever AI model you configure

---

## Core Architecture

- **Runtime:** Node.js (v22+)
- **Communication:** WebSocket gateway
- **Persona system:** Customizable personas with persistent memory
- **Extensibility:** Skills system (plugin-based)
- **Security:** Sandboxed execution environment

### Key Configuration Files

| File | Purpose |
|------|---------|
| `IDENTITY.md` | Defines the assistant's persona, tone, and behavior |
| `USER.md` | Stores information about you (the user) for personalized responses |
| `MEMORY.md` | Persistent knowledge base that accumulates over time |

---

## Supported Platforms

| Platform | Notes |
|----------|-------|
| **macOS** | Native app with menu bar integration |
| **Linux** | Runs as a systemd daemon |
| **Windows** | Runs via WSL2 |
| **VPS** | Recommended for 24/7 uptime; ~$5/month |
| **Docker** | Containerized deployment option |

---

## Messaging Channels

- WhatsApp
- Telegram
- Discord
- iMessage
- Slack
- Mattermost

---

## AI Model Support

- **Claude** (Anthropic)
- **GPT** (OpenAI)
- **Local models** via Ollama
- Anything else with a compatible API

---

## Setup Flow

1. Install the CLI: via `curl` or `npm`
2. Run `clawdbot onboard --install-daemon`
3. Connect your messaging channels
4. Customize the workspace (edit `IDENTITY.md`, `USER.md`, etc.)
5. Install skills from the marketplace

### Setup Tip for Max Plan Users (Source 2 -- @0x5am5)

- If using the Max plan, set up using the **Anthropic setup-token**
- Run `claude setup-token` to obtain the token
- **Do not use the Claude Code CLI option** -- use the token-based setup instead

---

## Skills (via ClawdHub Marketplace)

- **Brave Search** -- web search integration
- **Browser Control** -- automated browsing / scraping
- **GitHub** -- repo management, issues, PRs
- **Whisper** -- speech-to-text
- **Code Execution** -- run code in sandboxed environments
- **Calendar** -- scheduling and event management
- **Email** -- send, read, and manage emails

---

## Use Cases Covered

### Daily Planning / Intelligence
- Morning briefings, schedule summaries, news digests

### Idea Execution / Research
- Sub-agents for deep research tasks
- Break down complex projects into steps

### Media / Content Automation
- Voice-to-text pipeline (via Whisper skill)
- Content drafting and formatting

### Coding / Debugging
- Pair programming through chat
- Code review and debugging assistance

### Business Operations
- E-commerce workflow automation
- Operational task management

---

## Deployment Recommendations

- **VPS deployment** is recommended for true 24/7 availability
- Use **Tailscale** for secure tunneling to the VPS
- Budget approximately **$5/month** for a basic VPS instance

---

## Alternative Approach: Lightweight Setup (Source 3 -- @kichsr)

- Instead of a full framework like OpenClaw, consider a **lightweight but flexible** setup
- Use the **Claude desktop app as the orchestrator**
- Add **API keys for external models**, each chosen for specific strengths:
  - **Grok** for X/Twitter data access
  - **Gemini** for web search capabilities
  - Other models as needed for their specialties
- Use **GPT to write prompts for Claude**, debug outputs, and critique design decisions
- Core idea: **you only need 1-2 apps** to get a capable personal assistant running
- Trade-off: less automation and always-on capability, but simpler to set up and maintain

---

## Key Takeaways

### Reasons to Use OpenClaw (Modify Existing Framework)
- MIT license means full freedom to modify and deploy
- Messaging channel integrations are already built (WhatsApp, Telegram, etc.)
- Skills marketplace provides ready-made plugins for common tasks
- Persistent memory system (`IDENTITY.md`, `USER.md`, `MEMORY.md`) is already designed
- WebSocket gateway and sandboxed execution are non-trivial to build from scratch
- Community and ecosystem (ClawdHub) mean you are not maintaining everything alone
- 24/7 daemon mode with VPS deployment is a solved problem in this stack

### Reasons to Build Your Own
- Full control over architecture decisions and data flow
- No dependency on the OpenClaw project's roadmap or maintenance
- Can tailor the system exactly to your needs without working around framework conventions
- Lighter footprint if you only need a subset of features
- The lightweight approach (@kichsr) shows that a capable setup can be achieved with just Claude desktop + a few API keys

### Decision Framework
- If you need **always-on messaging integration** across multiple platforms: lean toward OpenClaw
- If you want a **simple coding/research assistant** without 24/7 messaging: the lightweight approach may suffice
- If you want to **learn the internals** and have specific architectural requirements: build your own, but consider using OpenClaw's design patterns as reference
- If you go the Max plan route: use the **setup-token method**, not the Claude Code CLI option
