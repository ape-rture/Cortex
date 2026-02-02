# Claude Code Tips from the Claude Code Team

## Source

- **Author:** @bcherny (Boris Cherny, creator of Claude Code)
- **Title:** Tips from the Claude Code team
- **URL:** https://x.com/bcherny/status/2017742741636321619

---

## Overview

Eight practical tips from the creator of Claude Code and the team that builds it daily. These range from workflow patterns to environment setup, all aimed at maximizing effectiveness with Claude Code.

---

## Tip 1: Do More in Parallel

- Spin up 3-5 git worktrees at once
- Each worktree runs its own Claude Code session in parallel
- This multiplies throughput -- instead of waiting for one task to complete before starting the next, run them simultaneously
- Requires tasks that are sufficiently independent (different files, different features)

## Tip 2: Start Every Complex Task in Plan Mode

- Pour energy into the plan so Claude can one-shot the implementation
- A well-crafted plan front-loads the thinking and reduces iteration cycles
- The time spent planning pays off in fewer failed attempts and less back-and-forth
- Complex tasks benefit enormously from explicit planning before any code is written

## Tip 3: Invest in Your CLAUDE.md

- After every correction: "Update your CLAUDE.md so you don't make that mistake again"
- Claude is good at writing rules for itself
- Ruthlessly iterate CLAUDE.md over time
- The file becomes a living document that captures project-specific knowledge, conventions, and lessons learned
- Each correction is an opportunity to permanently improve future interactions

## Tip 4: Create Your Own Skills and Commit Them to Git

- Skills are reusable across every project
- Commit them to version control so they persist and evolve
- Reference: code.claude.com for skills documentation
- Skills encapsulate common workflows, reducing the need to re-explain patterns

## Tip 5: Claude Fixes Most Bugs by Itself

- Enable the Slack MCP server
- Paste a Slack bug report link
- Claude reads the thread, finds the bug, and fixes it
- The workflow: bug report -> Claude reads context -> Claude locates issue -> Claude implements fix
- Minimal human intervention required for straightforward bugs

## Tip 6: Level Up Your Prompting

- Challenge Claude with quality gates
- Example: "Grill me on these changes and don't make a PR until..."
- Use Claude as a reviewer, not just an implementer
- Adversarial prompting (asking Claude to find problems with its own work) improves output quality

## Tip 7: Terminal and Environment Setup

- The team loves Ghostty terminal
- Multiple team members appreciate its synchronized rendering
- Good terminal setup reduces friction in the development workflow
- Environment matters -- invest in tooling that makes the interaction smooth

## Tip 8: Use Subagents

- Append "use subagents" to any request where you want Claude to throw more compute at the problem
- Subagents allow Claude to parallelize research, analysis, or exploration
- Useful for complex tasks that benefit from multiple angles of investigation
- Simple trigger phrase, significant capability upgrade

---

## Key Takeaways

### For Personal Assistant Development

1. **CLAUDE.md is the highest-leverage investment.** The pattern of "correct Claude -> have Claude update its own rules" creates a compounding improvement loop. Our personal assistant's CLAUDE.md should be treated as the most important file in the project. Every mistake is an opportunity to add a permanent rule.

2. **Plan mode for complex tasks.** Before implementing any complex feature or workflow, use plan mode to think through the approach. This applies both to how we build the assistant and to how the assistant itself should approach complex user requests.

3. **Parallel worktrees for development speed.** When building the personal assistant, use multiple worktrees to develop independent features simultaneously. For example, one worktree for memory system improvements, another for a new MCP integration, a third for testing.

4. **Skills are reusable assets.** Every workflow we build for the personal assistant should be considered as a potential skill that can be committed to git and reused. Skills documentation at code.claude.com is worth studying.

5. **The Slack MCP pattern generalizes.** "Connect an information source via MCP, let Claude read context, let Claude act" is a universal pattern. For our assistant, this means connecting as many relevant information sources as possible via MCP servers.

6. **Adversarial prompting improves quality.** Asking the assistant to critique its own work before finalizing ("grill me on these changes") is a pattern we should build into our workflows. Self-review before delivery.

7. **Subagents are a simple force multiplier.** The phrase "use subagents" is a low-effort way to get Claude to parallelize work. We should document when subagents are appropriate and build this into our assistant's operational patterns.

8. **Environment setup compounds.** Investing in terminal setup, MCP server configuration, and tooling pays dividends over every future interaction. Front-load this investment.

---

## Practical Actions

- [ ] Ensure CLAUDE.md has a "lessons learned" section that gets updated after every significant interaction
- [ ] Set up git worktree workflow for parallel development sessions
- [ ] Create reusable skills for common personal assistant workflows
- [ ] Configure relevant MCP servers for information sources the assistant needs
- [ ] Establish a "self-review" step in the assistant's task completion workflow
- [ ] Document when to use subagents vs. single-agent execution
