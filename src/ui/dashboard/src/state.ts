import { signal } from "@preact/signals";
import type {
  AgentLiveState,
  ChatSessionLite,
  CycleSummary,
  DashboardData,
  ReviewItem,
} from "./types";

// Connection
export const connectionStatus = signal<"connected" | "reconnecting" | "disconnected">(
  "disconnected",
);

// Chat
export const sessions = signal<ChatSessionLite[]>([]);
export const activeSessionId = signal<string | null>(null);

// Dashboard
export const dashboardData = signal<DashboardData | null>(null);

// Monitor
export const activeAgents = signal<Map<string, AgentLiveState>>(new Map());
export const cycleHistory = signal<CycleSummary[]>([]);
export const monitorConnected = signal(false);

// Review
export const reviewItems = signal<ReviewItem[]>([]);
