import type { ChatMessage, ChatSession } from "./types.js";

type StoredSession = {
  id: ChatSession["id"];
  name: ChatSession["name"];
  created_at: ChatSession["created_at"];
  messages: ChatMessage[];
  pending_response?: boolean;
  pending_prompt?: string;
  pending_message_id?: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    timestamp: nowIso(),
  };
}

export class InMemorySessionStore {
  private readonly sessions = new Map<string, StoredSession>();

  list(): readonly Pick<ChatSession, "id" | "name" | "created_at">[] {
    return Array.from(this.sessions.values()).map((session) => ({
      id: session.id,
      name: session.name,
      created_at: session.created_at,
    }));
  }

  create(name?: string): StoredSession {
    const session: StoredSession = {
      id: crypto.randomUUID(),
      name: name ?? `Session ${this.sessions.size + 1}`,
      created_at: nowIso(),
      messages: [],
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(sessionId: string): StoredSession | undefined {
    return this.sessions.get(sessionId);
  }

  delete(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  addUserMessage(sessionId: string, content: string): ChatMessage {
    const session = this.requireSession(sessionId);
    const message = createMessage("user", content);
    session.messages = [...session.messages, message];
    session.pending_prompt = content;
    session.pending_response = true;
    return message;
  }

  startAssistantMessage(sessionId: string): ChatMessage {
    const session = this.requireSession(sessionId);
    const message = createMessage("assistant", "");
    session.messages = [...session.messages, message];
    session.pending_message_id = message.id;
    return message;
  }

  finishAssistantMessage(sessionId: string, messageId: string, content: string, modelUsed?: string, latencyMs?: number): void {
    const session = this.requireSession(sessionId);
    session.messages = session.messages.map((message) => {
      if (message.id !== messageId) return message;
      return {
        ...message,
        content,
        model_used: modelUsed,
        latency_ms: latencyMs,
      };
    });
    session.pending_response = false;
    session.pending_prompt = undefined;
    session.pending_message_id = undefined;
  }

  getPendingPrompt(sessionId: string): string | undefined {
    const session = this.requireSession(sessionId);
    return session.pending_prompt;
  }

  getPendingMessageId(sessionId: string): string | undefined {
    const session = this.requireSession(sessionId);
    return session.pending_message_id;
  }

  private requireSession(sessionId: string): StoredSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }
    return session;
  }
}
