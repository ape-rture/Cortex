import type { Hono } from "hono";
import type { SendMessageRequest } from "../types.js";
import { jsonError, buildConversation } from "../utils.js";
import { InMemorySessionStore } from "../store.js";
import { ConfigRouter } from "../../core/routing.js";
import { runMorningBriefing } from "../../cli/gm.js";
import { runDailyDigest } from "../../cli/digest.js";
import { runMeetingPrep } from "../../cli/prep.js";
import { runContent } from "../../cli/content.js";
import { runOrchestrate } from "../../cli/orchestrate.js";
import { MarkdownTaskQueue } from "../../core/task-queue.js";
import { MarkdownContactStore } from "../../utils/contact-store.js";
import { MarkdownSessionSnapshotStore } from "../../core/session-snapshot.js";
import type { AgentEvent } from "../../core/types/events.js";

type SSEEvent = "message_start" | "delta" | "message_end" | "error";

function encodeEvent(event: SSEEvent, data: unknown): Uint8Array {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(payload);
}

function formatOrchestratorEvent(event: AgentEvent): string {
  if (event.type === "started") {
    return `- ${event.agent}: started`;
  }
  if (event.type === "action") {
    return `- ${event.agent}: ${event.action.kind} ${event.action.label} (${event.phase})`;
  }
  if (event.ok) {
    return `- ${event.agent}: completed`;
  }
  return `- ${event.agent}: failed (${event.error ?? "unknown error"})`;
}

// ---------------------------------------------------------------------------
// Command registry
// ---------------------------------------------------------------------------

type CommandResult = { content: string; modelUsed: string };

/** Simple slash commands: /command [args] -> local result */
const commands: Record<string, (args: string) => Promise<string>> = {
  "/digest": () => runDailyDigest(),
  "/prep": (args) => {
    if (!args.trim()) return Promise.resolve('Usage: /prep "Contact Name"');
    return runMeetingPrep(args.trim());
  },
  "/content": (args) => {
    const parts = args.trim().split(/\s+/);
    return runContent(parts.filter(Boolean));
  },
  "/orchestrate": (args) => {
    const parts = args.trim().split(/\s+/).filter(Boolean);
    return runOrchestrate(parts);
  },
  "/tasks": async () => {
    const queue = new MarkdownTaskQueue();
    const tasks = await queue.list();
    if (tasks.length === 0) return "(no tasks in queue)";
    const lines = ["# Task Queue", ""];
    for (const task of tasks) {
      lines.push(`- [${task.status}] **${task.title}** (${task.priority})`);
      if (task.description) lines.push(`  ${task.description}`);
    }
    return lines.join("\n");
  },
  "/contacts": async (args) => {
    const query = args.trim();
    const store = new MarkdownContactStore();
    if (!query) {
      const all = await store.loadAll();
      if (all.length === 0) return "(no contacts)";
      return all.map((c) => `- **${c.name}**${c.company ? ` (${c.company})` : ""} — ${c.type}`).join("\n");
    }
    const results = await store.search(query);
    if (results.length === 0) return `No contacts matching "${query}"`;
    return results.map((c) => `- **${c.name}**${c.company ? ` (${c.company})` : ""} — ${c.type}`).join("\n");
  },
  "/snapshot": async () => {
    const snapshot = await new MarkdownSessionSnapshotStore().load();
    if (!snapshot) return "(no session snapshot)";
    const lines = [
      `# Session Snapshot`,
      "",
      `**Working on:** ${snapshot.working_on}`,
      "",
      "**Next steps:**",
      ...snapshot.next_steps.map((s) => `- ${s}`),
    ];
    if (snapshot.open_questions?.length) {
      lines.push("", "**Open questions:**");
      for (const q of snapshot.open_questions) lines.push(`- ${q}`);
    }
    return lines.join("\n");
  },
};

// ---------------------------------------------------------------------------
// Morning command (special: supports hybrid mode with LLM follow-up)
// ---------------------------------------------------------------------------

function parseMorningCommand(value: string): { instruction?: string } | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "gm" || normalized === "/gm" || normalized === "good morning" || normalized === "morning") {
    return {};
  }

  const slashWithArg = value.trim().match(/^\/gm\s+(.+)$/i);
  if (slashWithArg) {
    const instruction = slashWithArg[1].trim();
    return instruction ? { instruction } : {};
  }

  return null;
}

// ---------------------------------------------------------------------------
// Resolve prompt to command
// ---------------------------------------------------------------------------

async function resolveCommand(
  prompt: string,
  router: ConfigRouter,
): Promise<CommandResult | null> {
  // Morning briefing (special: hybrid mode)
  const morning = parseMorningCommand(prompt);
  if (morning) {
    const briefing = await runMorningBriefing();
    if (!morning.instruction) {
      return { content: briefing, modelUsed: "local:gm" };
    }

    const response = await router.route({
      task_type: "complex_reasoning",
      system_prompt: "You're a personal assistant. Help with the user's request based on their briefing.",
      prompt: `Here's my morning briefing:\n\n${briefing}\n\nUser request: ${morning.instruction}`,
    });
    return {
      content: response.content,
      modelUsed: `hybrid:gm+${response.model_used}`,
    };
  }

  // Legacy aliases (no slash)
  const normalized = prompt.trim().toLowerCase();
  if (normalized === "digest") {
    const content = await runDailyDigest();
    return { content, modelUsed: "local:digest" };
  }

  // Slash command registry
  const match = prompt.trim().match(/^(\/\w+)(?:\s+(.*))?$/);
  if (match) {
    const cmd = match[1].toLowerCase();
    const args = match[2] ?? "";
    const handler = commands[cmd];
    if (handler) {
      const content = await handler(args);
      const tag = cmd.slice(1); // remove leading /
      return { content, modelUsed: `local:${tag}` };
    }
  }

  return null;
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

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const start = Date.now();
          const orchestrateMatch = pendingPrompt.trim().match(/^\/orchestrate(?:\s+(.*))?$/i);

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

          const commandResult = await resolveCommand(pendingPrompt, router);
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
