import type { Hono } from "hono";
import type { SendMessageRequest } from "../types.js";
import { jsonError, buildConversation } from "../utils.js";
import { InMemorySessionStore } from "../store.js";
import { ConfigRouter } from "../../core/routing.js";
import { runOrchestrate } from "../../cli/orchestrate.js";
import { interceptCommandShortcut } from "../../core/command-interceptor.js";
import {
  resolveCommand,
  formatOrchestratorEvent,
} from "../../core/command-registry.js";
import { query } from "@anthropic-ai/claude-agent-sdk";

type SSEEvent = "message_start" | "delta" | "message_end" | "error";

function encodeEvent(event: SSEEvent, data: unknown): Uint8Array {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(payload);
}

// ---------------------------------------------------------------------------
// Claude Code agent for free-form chat
// ---------------------------------------------------------------------------

const CHAT_AGENT_MODEL = "haiku";
const CHAT_AGENT_MAX_TURNS = 8;
const CHAT_AGENT_TIMEOUT_MS = 90_000;
const CHAT_AGENT_TOOLS = ["Read", "Glob", "Grep"];

async function streamClaudeCodeAgent(
  userPrompt: string,
  conversationContext: string,
  systemPrompt: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
): Promise<{ content: string; latencyMs: number }> {
  const start = Date.now();
  const modelLabel = `claude-code:${CHAT_AGENT_MODEL}`;

  controller.enqueue(encodeEvent("message_start", { model: modelLabel }));

  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), CHAT_AGENT_TIMEOUT_MS);

  // Include recent conversation context so the agent knows what was discussed
  const fullPrompt = conversationContext
    ? `Previous conversation:\n${conversationContext}\n\nUser: ${userPrompt}`
    : userPrompt;

  const chunks: string[] = [];

  try {
    const q = query({
      prompt: fullPrompt,
      options: {
        systemPrompt,
        model: CHAT_AGENT_MODEL,
        tools: [...CHAT_AGENT_TOOLS],
        allowedTools: [...CHAT_AGENT_TOOLS],
        maxTurns: CHAT_AGENT_MAX_TURNS,
        cwd: process.cwd(),
        persistSession: false,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        abortController,
      },
    });

    for await (const message of q) {
      if ((message as { type: string }).type === "result") break;

      const msgAny = message as Record<string, unknown>;
      if (msgAny.type === "assistant" && Array.isArray(msgAny.content)) {
        for (const block of msgAny.content as Array<Record<string, unknown>>) {
          if (block.type === "text" && typeof block.text === "string") {
            chunks.push(block.text);
            controller.enqueue(encodeEvent("delta", { content: block.text }));
          }
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }

  const latencyMs = Date.now() - start;
  return { content: chunks.join(""), latencyMs };
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

function buildPrompt(messages: readonly { role: string; content: string }[]): string {
  return buildConversation(messages);
}

function buildConversationContext(messages: readonly { role: string; content: string }[]): string {
  // Include up to the last 10 messages for conversation context (excluding the latest user message)
  const contextMessages = messages.slice(0, -1).slice(-10);
  if (contextMessages.length === 0) return "";
  return contextMessages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");
}

export function registerChatHandlers(
  app: Hono,
  store: InMemorySessionStore,
  router: ConfigRouter,
  systemPrompt: string,
): void {
  app.post("/api/sessions/:id/messages", async (c) => {
    const sessionId = c.req.param("id");
    const session = store.get(sessionId);
    if (!session) return jsonError(c, "Session not found", 404);
    const body = (await c.req.json().catch(() => ({}))) as SendMessageRequest;
    if (!body.content || body.content.trim().length === 0) return jsonError(c, "Content required", 400);
    const message = store.addUserMessage(sessionId, body.content.trim());
    return c.json({ message_id: message.id, status: "queued" });
  });

  app.get("/api/sessions/:id/stream", (c) => {
    const sessionId = c.req.param("id");
    const session = store.get(sessionId);
    if (!session) return jsonError(c, "Session not found", 404);
    const pendingPrompt = store.getPendingPrompt(sessionId);
    if (!pendingPrompt) return jsonError(c, "No pending message", 400);

    const assistantMessage = store.startAssistantMessage(sessionId);
    const intercepted = interceptCommandShortcut(pendingPrompt);
    const interceptedPrompt = intercepted.prompt;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const start = Date.now();
          const orchestrateMatch = interceptedPrompt.trim().match(/^\/orchestrate(?:\s+(.*))?$/i);

          if (orchestrateMatch) {
            const chunks: string[] = [];
            const appendChunk = (content: string): void => {
              chunks.push(content);
              controller.enqueue(encodeEvent("delta", { content }));
            };

            controller.enqueue(
              encodeEvent("message_start", {
                message_id: assistantMessage.id,
                model: "local:orchestrate",
              }),
            );

            const args = (orchestrateMatch[1] ?? "").trim().split(/\s+/).filter(Boolean);
            const summary = await runOrchestrate(args, {
              onEvent: (event) => {
                appendChunk(`${formatOrchestratorEvent(event)}\n`);
              },
            });

            if (summary.trim()) {
              const prefix = chunks.length > 0 ? "\n" : "";
              appendChunk(`${prefix}${summary}`);
            }

            const latencyMs = Date.now() - start;
            controller.enqueue(encodeEvent("message_end", { message_id: assistantMessage.id, latency_ms: latencyMs }));
            store.finishAssistantMessage(
              sessionId,
              assistantMessage.id,
              chunks.join(""),
              "local:orchestrate",
              latencyMs,
            );
            return;
          }

          // Try local command resolution first (instant, no API call)
          const commandResult = await resolveCommand(interceptedPrompt, router);
          if (commandResult) {
            controller.enqueue(encodeEvent("message_start", { message_id: assistantMessage.id, model: commandResult.modelUsed }));
            const latencyMs = Date.now() - start;
            controller.enqueue(encodeEvent("delta", { content: commandResult.content }));
            controller.enqueue(encodeEvent("message_end", { message_id: assistantMessage.id, latency_ms: latencyMs }));
            store.finishAssistantMessage(sessionId, assistantMessage.id, commandResult.content, commandResult.modelUsed, latencyMs);
            return;
          }

          // Free-form chat: route through Claude Code agent (full context, tools, file access)
          const conversationContext = buildConversationContext(session.messages);
          const { content, latencyMs } = await streamClaudeCodeAgent(
            pendingPrompt,
            conversationContext,
            systemPrompt,
            controller,
          );
          const modelLabel = `claude-code:${CHAT_AGENT_MODEL}`;
          controller.enqueue(encodeEvent("message_end", { message_id: assistantMessage.id, latency_ms: latencyMs }));
          store.finishAssistantMessage(sessionId, assistantMessage.id, content, modelLabel, latencyMs);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          controller.enqueue(encodeEvent("error", { error: message }));
          store.finishAssistantMessage(sessionId, assistantMessage.id, message, "error", 0);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  });
}
