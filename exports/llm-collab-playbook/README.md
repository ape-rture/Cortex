# LLM Collaboration Playbook Export

This folder is a portable starter kit for multi-agent collaboration in other repos.

It includes:
- `template-root/`: clean portable templates to paste into a new repo
- `raw-current/`: direct copies of this project's current instruction files
- `COLLAB-COMMANDS.md`: quick command/workflow reference

## How to use in another project

1. Copy all files from `exports/llm-collab-playbook/template-root/` into the root of your target repo.
2. Rename placeholders like `[PROJECT_NAME]`, `[OWNER_NAME]`, and branch prefixes if needed.
3. Keep `CONVENTIONS.md` as the shared source of truth.
4. Instruct each LLM agent to read `CONVENTIONS.md` first, then its own instruction file.

If you want your exact current setup, copy from `exports/llm-collab-playbook/raw-current/` instead.

## Minimal setup checklist

- Add `.cortex/active.md`, `.cortex/tasks.md`, `.cortex/log.md`
- Add `CONVENTIONS.md`
- Add one instruction file per agent (`CLAUDE.md`, `AGENTS.md`, etc.)
- Define branch naming + commit message format
- Define file reservation and handoff protocol
