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

type SSEEvent = "message_start" | "delta" | "message_end" | "error";

function encodeEvent(event: SSEEvent, data: unknown): Uint8Array {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(payload);
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

function buildPrompt(messages: readonly { role: string; content: string }[]): string {
  return buildConversation(messages);
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
    const prompt = buildPrompt(session.messages);
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

          const commandResult = await resolveCommand(interceptedPrompt, router);
          const response = commandResult
            ? {
                content: commandResult.content,
                model_used: commandResult.modelUsed,
              }
            : await router.route({
                prompt,
                system_prompt: systemPrompt,
              });
          controller.enqueue(encodeEvent("message_start", { message_id: assistantMessage.id, model: response.model_used }));
          const latencyMs = Date.now() - start;
          const content = response.content ?? "";
          controller.enqueue(encodeEvent("delta", { content }));
          controller.enqueue(encodeEvent("message_end", { message_id: assistantMessage.id, latency_ms: latencyMs }));
          store.finishAssistantMessage(sessionId, assistantMessage.id, content, response.model_used, latencyMs);
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
