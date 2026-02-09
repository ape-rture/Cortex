import { useState, useEffect, useRef } from "preact/hooks";
import { api } from "../api";
import type { ChatMessage, ChatSession, ChatSessionLite } from "../types";

// --- Message bubble ---

function Message({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div class={`message ${isUser ? "user" : "assistant"}`}>
      <div class="message-role">{isUser ? "You" : "Cortex"}</div>
      <div class="message-content">{message.content}</div>
      {message.model_used && (
        <div class="message-meta">
          {message.model_used} &mdash; {message.latency_ms}ms
        </div>
      )}
    </div>
  );
}

// --- Session list sidebar ---

function SessionList({
  sessions,
  activeId,
  onSelect,
  onCreate,
  onDelete,
}: {
  sessions: ChatSessionLite[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div class="session-list">
      <div class="session-header">
        <span>Sessions</span>
        <button class="btn-new" onClick={onCreate}>
          + New
        </button>
      </div>
      <div class="session-items">
        {sessions.map((s) => (
          <div
            key={s.id}
            class={`session-item${s.id === activeId ? " active" : ""}`}
            onClick={() => onSelect(s.id)}
          >
            <span class="session-name">{s.name}</span>
            <button
              class="btn-delete"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(s.id);
              }}
            >
              x
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Chat pane ---

function ChatPane({
  session,
  onSend,
  isStreaming,
  streamingContent,
}: {
  session: ChatSession | null;
  onSend: (content: string) => void;
  isStreaming: boolean;
  streamingContent: string;
}) {
  const [input, setInput] = useState("");
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [session?.messages, streamingContent]);

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (input.trim() && !isStreaming) {
      onSend(input.trim());
      setInput("");
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      handleSubmit(e);
    }
  };

  if (!session) {
    return (
      <div class="chat-pane empty">
        <p>Select or create a session to start chatting</p>
      </div>
    );
  }

  return (
    <div class="chat-pane">
      <div class="chat-header">{session.name}</div>
      <div class="messages" ref={messagesRef}>
        {session.messages.map((m) => (
          <Message key={m.id} message={m} />
        ))}
        {isStreaming && streamingContent && (
          <div class="message assistant streaming">
            <div class="message-role">Cortex</div>
            <div class="message-content">{streamingContent}</div>
          </div>
        )}
      </div>
      <form class="input-area" onSubmit={handleSubmit}>
        <textarea
          value={input}
          onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your message..."
          disabled={isStreaming}
          rows={2}
        />
        <button class="btn-send" type="submit" disabled={isStreaming || !input.trim()}>
          {isStreaming ? "..." : "Send"}
        </button>
      </form>
    </div>
  );
}

// --- Chat view (full page with session list + chat pane) ---

export function ChatView() {
  const [sessions, setSessions] = useState<ChatSessionLite[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Load sessions on mount, auto-create one if empty
  useEffect(() => {
    api.getSessions().then(async (existing) => {
      if (existing.length === 0) {
        const newSession = await api.createSession("Session 1");
        setSessions([newSession]);
        setActiveSessionId(newSession.id);
      } else {
        setSessions(existing);
      }
    });
  }, []);

  // Load active session when selection changes
  useEffect(() => {
    if (activeSessionId) {
      api.getSession(activeSessionId).then(setActiveSession);
    } else {
      setActiveSession(null);
    }
  }, [activeSessionId]);

  const handleCreateSession = async () => {
    try {
      const name = `Session ${sessions.length + 1}`;
      const newSession = await api.createSession(name);
      setSessions([...sessions, newSession]);
      setActiveSessionId(newSession.id);
    } catch (err) {
      setError(`Failed to create session: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDeleteSession = async (id: string) => {
    await api.deleteSession(id);
    setSessions(sessions.filter((s) => s.id !== id));
    if (activeSessionId === id) {
      setActiveSessionId(null);
    }
  };

  const handleSendMessage = async (content: string) => {
    if (!activeSessionId || !activeSession) return;

    // Add user message optimistically
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };
    setActiveSession((prev) =>
      prev ? { ...prev, messages: [...prev.messages, userMessage] } : prev,
    );

    setIsStreaming(true);
    setStreamingContent("");

    try {
      await api.sendMessage(activeSessionId, content);

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      let fullContent = "";
      let messageId = "";
      let model = "";
      let latencyMs = 0;

      const es = api.connectStream(activeSessionId);
      eventSourceRef.current = es;

      es.addEventListener("message_start", (e: MessageEvent) => {
        const data = JSON.parse(e.data);
        messageId = data.message_id;
        model = data.model;
      });

      es.addEventListener("delta", (e: MessageEvent) => {
        const data = JSON.parse(e.data);
        fullContent += data.content;
        setStreamingContent(fullContent);
      });

      es.addEventListener("message_end", (e: MessageEvent) => {
        const data = JSON.parse(e.data);
        latencyMs = data.latency_ms;
        const assistantMessage: ChatMessage = {
          id: messageId,
          role: "assistant",
          content: fullContent,
          timestamp: new Date().toISOString(),
          model_used: model,
          latency_ms: latencyMs,
        };
        setActiveSession((prev) =>
          prev ? { ...prev, messages: [...prev.messages, assistantMessage] } : prev,
        );
        setIsStreaming(false);
        setStreamingContent("");
        es.close();
      });

      es.addEventListener("error", (e: MessageEvent) => {
        if (e.data) {
          const data = JSON.parse(e.data);
          setError(data.error);
        }
        setIsStreaming(false);
        es.close();
      });

      es.onerror = () => {
        setIsStreaming(false);
        es.close();
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsStreaming(false);
    }
  };

  return (
    <div class="chat-layout">
      {error && (
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            background: "rgba(255,107,107,0.1)",
            color: "var(--error)",
            padding: "6px 12px",
            borderRadius: "4px",
            fontSize: "13px",
            zIndex: 10,
          }}
        >
          {error}
        </div>
      )}
      <SessionList
        sessions={sessions}
        activeId={activeSessionId}
        onSelect={setActiveSessionId}
        onCreate={handleCreateSession}
        onDelete={handleDeleteSession}
      />
      <ChatPane
        session={activeSession}
        onSend={handleSendMessage}
        isStreaming={isStreaming}
        streamingContent={streamingContent}
      />
    </div>
  );
}
