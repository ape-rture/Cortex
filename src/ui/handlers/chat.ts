import type { Hono } from "hono";
import type { SendMessageRequest } from "../types.js";
import { jsonError, buildConversation } from "../utils.js";
import { InMemorySessionStore } from "../store.js";
import { ConfigRouter } from "../../core/routing.js";

type SSEEvent = "message_start" | "delta" | "message_end" | "error";

function encodeEvent(event: SSEEvent, data: unknown): Uint8Array {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(payload);
}

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

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encodeEvent("message_start", { message_id: assistantMessage.id, model: "routing" }));
        try {
          const start = Date.now();
          const response = await router.route({
            prompt,
            system_prompt: systemPrompt,
          });
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
