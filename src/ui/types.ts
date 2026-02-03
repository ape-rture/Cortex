/**
 * Web Terminal Types
 *
 * Types for the browser-based chat interface.
 */

/**
 * A chat session containing conversation history.
 */
export interface ChatSession {
  /** Unique session identifier (UUID) */
  readonly id: string;

  /** Display name for the session ("Session 1", "Session 2", etc.) */
  readonly name: string;

  /** ISO timestamp when session was created */
  readonly created_at: string;

  /** Conversation history */
  readonly messages: readonly ChatMessage[];

  /** True while waiting for LLM response */
  readonly pending_response?: boolean;
}

/**
 * A single message in the conversation.
 */
export interface ChatMessage {
  /** Unique message identifier (UUID) */
  readonly id: string;

  /** Who sent this message */
  readonly role: "user" | "assistant";

  /** Message content */
  readonly content: string;

  /** ISO timestamp */
  readonly timestamp: string;

  /** Model that generated this response (e.g., "anthropic:sonnet") */
  readonly model_used?: string;

  /** Response latency in milliseconds */
  readonly latency_ms?: number;
}

/**
 * Request to create a new session.
 */
export interface CreateSessionRequest {
  /** Optional custom name for the session */
  readonly name?: string;
}

/**
 * Response when creating a session.
 */
export interface CreateSessionResponse {
  readonly id: string;
  readonly name: string;
  readonly created_at: string;
}

/**
 * Request to send a message.
 */
export interface SendMessageRequest {
  readonly content: string;
}

/**
 * Response when sending a message.
 */
export interface SendMessageResponse {
  readonly message_id: string;
  readonly status: "queued" | "processing" | "complete" | "error";
}

/**
 * SSE event types for streaming responses.
 */
export type SSEEventType = "message_start" | "delta" | "message_end" | "error";

/**
 * SSE message_start event data.
 */
export interface SSEMessageStart {
  readonly message_id: string;
  readonly model: string;
}

/**
 * SSE delta event data (content chunk).
 */
export interface SSEDelta {
  readonly content: string;
}

/**
 * SSE message_end event data.
 */
export interface SSEMessageEnd {
  readonly message_id: string;
  readonly latency_ms: number;
}

/**
 * SSE error event data.
 */
export interface SSEError {
  readonly error: string;
}

/**
 * Session list response.
 */
export interface ListSessionsResponse {
  readonly sessions: readonly Pick<ChatSession, "id" | "name" | "created_at">[];
}
