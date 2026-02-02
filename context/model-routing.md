# Model Routing Configuration

**Last updated**: 2026-02-02
**Mode**: Static rules + user override
**Providers**: Anthropic (Claude), OpenAI (GPT/Codex), Local (Ollama — future)

## How Routing Works

1. User can override any routing: "use Opus for this" or "send this to Codex" → uses that
2. Otherwise, task type → model mapping below
3. If primary model fails → try fallback
4. All calls logged to `/context/model-performance.md`
5. Cortex should be able to dispatch to BOTH Claude and OpenAI APIs — they are complementary, not competing

## Available Providers

| Provider | Models | API | Notes |
|---|---|---|---|
| **Anthropic** | Claude Opus, Sonnet, Haiku | Anthropic API | Primary for reasoning, content, general agent work |
| **OpenAI** | GPT-4o, GPT Codex | OpenAI API | Available for coding tasks, second opinion, specific strengths |
| **Local (future)** | Ollama models | localhost:11434 | When GPU hardware available |

## Routing Table

| Task Type | Primary | Fallback | Notes |
|---|---|---|---|
| Quick capture / filing | haiku | sonnet | Fast, cheap |
| Meeting summary | sonnet | opus | Balance speed + quality |
| Complex reasoning | opus | gpt-4o | Maximum reasoning, cross-check on hard problems |
| Code generation | sonnet | **codex** | Claude for most code, Codex for heavy backend/algorithmic work |
| Code review | sonnet | codex | Different models catch different issues |
| Content drafting | sonnet | — | Creative + fast |
| Research / analysis | opus | gpt-4o | Needs depth |
| Classification / routing | haiku | sonnet | Speed is king |
| Bulk operations | haiku | — | Cheap batch processing |
| Security audit | opus | — | Needs deep reasoning |
| Vibe coding (interactive) | **codex** | sonnet | Codex for dedicated coding sessions via OpenAI API |

## Multi-Provider Strategy

Cortex is NOT locked to one provider. The system should:

- **Route by strength**: Claude for reasoning/content, Codex for pure coding, Haiku for cheap/fast ops
- **Cross-validate on critical tasks**: For architecture decisions or security audits, optionally get a second opinion from a different provider
- **Track performance per provider per task**: The performance log shows which provider is actually better for each task type — use data, not assumptions
- **Unified interface**: The agent code calls a routing function, not a specific API. Switching models = changing config, not code
- **Cost awareness**: Track spend per provider. Alert if monthly costs exceed thresholds

## Coding Workflow: Claude Code + Codex

Both tools are available for coding. Use them based on context:

| Scenario | Tool | Why |
|---|---|---|
| Working in Claude Code session | Claude (Sonnet/Opus) | Already in context, has project knowledge |
| Dedicated coding task dispatched from queue | Codex via API | Codex excels at focused code generation |
| Code review / second opinion | Opposite of what wrote it | Different model catches different bugs |
| Pair programming / interactive | Claude Code CLI | Conversational, iterative |
| Batch code generation (many files) | Codex via API | Can parallelize requests |
| Debugging / tracing | Claude (Opus) | Strong reasoning about state |

## Local Models (Future — When Hardware Available)

When a GPU or Apple Silicon machine is available, add:

| Task Type | Local Model | Cloud Fallback |
|---|---|---|
| Quick capture / filing | llama3.1:8b | haiku |
| Classification / routing | llama3.1:8b | haiku |
| Code generation | qwen2.5-coder:14b | codex / sonnet |
| General agent work | qwen2.5:14b | sonnet |
| Embeddings | nomic-embed-text | — |
| Bulk operations | llama3.1:8b | haiku |

## Performance Tracking

After each LLM call, log:
- Task type
- Provider + model used
- Input tokens / output tokens
- Latency (time to first token, total time)
- Success (did the output achieve the task?)
- Cost estimate

Store in `/context/model-performance.md`. Review weekly for routing optimization.

---

*Cortex can propose routing changes based on accumulated performance data.*
