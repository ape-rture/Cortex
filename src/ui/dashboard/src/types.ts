// Chat types (mirrors backend src/ui/types.ts)

export interface ChatSession {
  id: string;
  name: string;
  created_at: string;
  messages: ChatMessage[];
}

export interface ChatSessionLite {
  id: string;
  name: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  model_used?: string;
  latency_ms?: number;
}

// Dashboard types

export interface DashboardData {
  last_cycle: CycleSummary | null;
  agent_health: Record<string, AgentHealth>;
  review_pending: number;
  task_summary: TaskSummary;
}

export interface CycleSummary {
  cycle_id: string;
  started_at: string;
  completed_at?: string;
  trigger_type: string;
  agents_spawned: string[];
  finding_count: number;
  surfaced_count: number;
  error_count: number;
}

export interface AgentHealth {
  agent: string;
  last_run?: string;
  last_ok: boolean;
  total_runs: number;
  total_errors: number;
  avg_latency_ms: number;
}

export interface TaskSummary {
  queued: number;
  in_progress: number;
  done: number;
  items: TaskItem[];
}

export interface TaskItem {
  title: string;
  status: "queued" | "in_progress" | "done";
  agent?: string;
}

// Review types

export interface ReviewItem {
  id: string;
  summary: string;
  detail?: string;
  urgency: string;
  agent: string;
  salience: number;
  status: "pending" | "approved" | "dismissed" | "snoozed";
  created_at: string;
}

// Monitor types

export interface AgentLiveState {
  agent: string;
  cycle_id: string;
  status: "running" | "completed" | "failed";
  started_at: string;
  actions: AgentAction[];
  token_usage?: { input: number; output: number };
  findings: FindingSummary[];
  error?: string;
  latency_ms?: number;
}

export interface AgentAction {
  kind: string;
  label: string;
  detail?: string;
  phase: string;
  elapsed_ms: number;
}

export interface FindingSummary {
  type: string;
  summary: string;
  urgency: string;
  salience: number;
}

// SSE event types from monitor stream
export interface MonitorEvent {
  type: "agent_started" | "agent_action" | "agent_completed" | "cycle_complete" | "heartbeat";
  data: unknown;
  timestamp: string;
}
