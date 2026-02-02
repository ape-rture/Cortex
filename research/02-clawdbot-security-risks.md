# Clawdbot / OpenClaw Security Risks - Research Notes

## Overview

Research into known security risks, attack vectors, and hardening strategies for Clawdbot (also referred to as OpenClaw / Moltbot in forks). These findings are relevant to anyone building or deploying a personal AI assistant with system-level access, regardless of the specific tooling used.

---

## Source 1: Real-World Attack Surface Exposure

**Author:** Shruti Gandhi (@atShruti, Array VC)
**URL:** https://x.com/atShruti/status/2015850485392245192

### Findings

- After deploying Clawdbot, the author was attacked **7,922 times over a single weekend**
- Hundreds of Clawdbot servers are exposed directly to the open internet
- Credential dumps and API keys found stored in plaintext on compromised instances

### Core Insight: Multi-Input Trust Problem

- "You're not the only input to your agent" - every email, calendar invite, webpage, and DM is content authored by someone else
- A random direct message becomes input to a system that has shell access
- This fundamentally changes the threat model compared to traditional software

### Recommendations

- Run on a **dedicated machine or VPS**, not your personal computer
- Use **separate accounts** for the agent (not your personal ones)
- Apply **minimal permissions** - only what the agent actually needs
- Run behind **Tailscale** or equivalent overlay network (no direct internet exposure)
- Run `clawdbot doctor` regularly to check for configuration drift
- Agents need **their own identities** - own devices, own accounts, own credentials
- Do not piggyback the agent on your personal identity/sessions
- Infrastructure does not need to be expensive: AWS free tier or a $5/month VPS is sufficient

---

## Source 2: Hardened AWS EC2 Deployment Guide

**Author:** Abhitej (@abhitejxyz)
**URL:** https://x.com/abhitejxyz/status/2016143016344334515

### Deployment Approach

A battle-tested guide for secure Clawdbot/Moltbot deployment on AWS EC2, covering infrastructure lockdown through application-level hardening.

### Infrastructure Hardening

- **Security Group lockdown:** SSH access restricted to known IPs only
- **Instance metadata hardened:** IMDSv2 enforced (prevents SSRF-based credential theft)
- **Node.js installed via nvm** (avoids system-level package manager risks)
- Run onboarding wizard **before** applying hardening (order matters)

### Application-Level Hardening

Critical configuration settings:

| Setting | Value | Purpose |
|---|---|---|
| Gateway bind address | `127.0.0.1` only | No external network exposure |
| Token auth | Enabled | Prevents unauthorized API access |
| Elevated tools | Disabled | Reduces privilege escalation surface |
| Sandbox | Forced on | Containment for all tool execution |
| Workspace access | None | No ambient filesystem access |
| Tool allowlist | Minimal (read, image only) | Whitelist approach to tool access |
| Tool denylist | exec, process, write, edit, apply_patch, browser | Explicit block on dangerous tools |

### Access Pattern

- All access via **SSH tunnel only** - no direct HTTP exposure
- Health check script for **drift detection** (alerts when config changes from hardened baseline)
- OPSEC checklist provided for ongoing operational security

### Time Estimate

- ~45 minutes if familiar with EC2
- Budget 90 minutes if new to AWS

---

## Source 3: Attack Vector Taxonomy (Defensive Reference)

**Author:** chirag (@mrnacknack)
**URL:** https://x.com/mrnacknack/status/2016134416897360212

An educational breakdown of 10 attack categories targeting Clawdbot deployments. Documented here for defensive awareness.

### 1. SSH Brute Force on Fresh VPS

- Default or weak passwords on newly provisioned instances
- Automated scanners (Shodan, Masscan) detect new SSH services within ~2 minutes of going online
- **Defense:** Key-based auth only, disable password auth, non-standard port, fail2ban

### 2. Exposed Control Gateway Without Auth

- 200+ vulnerable instances discovered with gateway exposed to the internet and no authentication
- **Defense:** Bind gateway to localhost, enable token authentication, access via SSH tunnel

### 3. Discord/Telegram Bot Without User ID Allowlist

- Bot responds to any user, leaking `.env` files, AWS credentials, SSH keys on request
- **Defense:** Implement user ID allowlists, use the pairing system

### 4. Browser Session Hijacking

- Chrome profile running with authenticated sessions accessible to the agent
- Attacker leverages agent access to exfiltrate session cookies
- **Defense:** Separate browser profile dedicated to the bot, no persistent authenticated sessions

### 5. Password Manager Extraction

- 1Password CLI (or similar) authenticated on the same system the agent runs on
- Agent can be prompted to extract credentials
- **Defense:** Never authenticate password managers on the agent's system

### 6. Slack Workspace Takeover via Stolen Tokens

- Slack tokens accessible to the agent enable full workspace access
- Corporate espionage risk if agent is compromised
- **Defense:** Scoped tokens with minimal permissions, separate service accounts, token rotation

### 7. "No Sandbox" Full System Takeover

- Running the agent as root without sandboxing
- Docker socket exposed, allowing container escape
- **Defense:** Always enable sandbox, run as non-root user, do not expose Docker socket

### 8. Prompt Injection via External Content

- Hidden instructions embedded in emails
- SEO-poisoned web pages designed to manipulate agent behavior
- Malicious PDFs with embedded prompt injections
- Slack messages and PR/code review content as injection vectors
- **Defense:** Use models with stronger prompt injection resistance (e.g., Claude Opus 4.5), input sanitization layers, content isolation

### 9. Supply Chain Attack via ClawdHub Skills

- Backdoored skills published to ClawdHub (the skill/plugin marketplace)
- Users install malicious skills that execute arbitrary code
- **Defense:** Audit skills before installation, prefer verified publishers, review skill source code

### 10. "Perfect Storm" - Combined Attack

- Demonstration of all mistakes combined resulting in total system compromise
- Timeline shows full takeover achievable in approximately 2 hours
- Illustrates that security is cumulative: each gap compounds the others

---

## Cross-Cutting Prevention Measures

Summary of defenses that appear across multiple sources:

- **Network isolation:** Bind all services to localhost, use SSH tunnels or Tailscale, never expose directly to internet
- **Authentication everywhere:** Token auth on gateway, user ID allowlists on chat integrations, key-based SSH
- **Sandboxing:** Always enabled, never run as root, restrict filesystem access
- **Identity separation:** Dedicated accounts, separate browser profiles, no password manager on agent system
- **Minimal permissions:** Allowlist-based tool access, deny dangerous tools explicitly, scoped API tokens
- **Monitoring:** Health check scripts, drift detection, regular security audits (`clawdbot doctor`, `clawdbot security audit --fix`)
- **Model selection:** Use models with stronger prompt injection resistance for agent tasks
- **Supply chain awareness:** Audit third-party skills/plugins before installation

---

## Key Takeaways for Personal Assistant Build

Regardless of whether building a custom assistant or using OpenClaw/Clawdbot, these security principles apply:

### Architectural Principles

1. **Treat all external content as untrusted input.** Emails, calendar invites, web pages, chat messages, documents - anything the agent ingests that was authored by someone other than you is a potential attack vector. This is the single most important insight.

2. **The agent needs its own identity.** Separate device (or VPS), separate accounts, separate credentials. The agent should never share your personal sessions, cookies, or authentication tokens.

3. **Defense in depth.** No single control is sufficient. Layer network isolation, authentication, sandboxing, permission restrictions, and monitoring together.

### Operational Principles

4. **Default-deny for tool access.** Start with everything blocked and explicitly allow only the tools the agent needs. Allowlists over denylists where possible, but use both.

5. **Network exposure is the primary risk multiplier.** An agent behind Tailscale/SSH with localhost-only bindings is orders of magnitude harder to attack than one with an open port on a public IP.

6. **Prompt injection is the hardest problem.** Unlike network/infrastructure attacks which have well-understood mitigations, prompt injection through normal content (emails, web pages, documents) is an ongoing research challenge. Mitigations include model selection, input isolation, and limiting the blast radius of any successful injection.

7. **Monitor for drift.** Configuration that is secure at deployment can degrade over time. Automated health checks and periodic audits catch regressions before attackers do.

8. **Budget for security setup time.** A properly hardened deployment takes 45-90 minutes. Skipping this step to save time is how the 200+ exposed instances happened.

### For This Project Specifically

- If deploying any agent with system access, provision a dedicated VPS (even a $5/month instance is fine)
- Never run the agent on a machine that has access to personal credentials, password managers, or authenticated browser sessions
- Implement input sanitization or content isolation for any external data the assistant processes
- Choose models with strong instruction-following and prompt injection resistance for agentic tasks
- Regularly audit what the agent can access and what it has accessed

---

*Research compiled: 2026-02-02*
*Status: Initial notes - to be updated as hardening approach is finalized*
