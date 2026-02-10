import type {
  ChatSession,
  ChatSessionLite,
  CycleSummary,
  DashboardData,
  ProjectHealthReport,
  ReviewItem,
  TaskSummary,
} from "./types";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function fetchDelete(url: string): Promise<void> {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
}

export const api = {
  // Sessions
  getSessions: () =>
    fetchJson<{ sessions: ChatSessionLite[] }>("/api/sessions").then((r) => r.sessions),
  createSession: (name?: string) =>
    postJson<ChatSessionLite>("/api/sessions", name ? { name } : {}),
  getSession: (id: string) => fetchJson<ChatSession>(`/api/sessions/${id}`),
  deleteSession: (id: string) => fetchDelete(`/api/sessions/${id}`),

  // Chat
  sendMessage: (sessionId: string, content: string) =>
    postJson<{ message_id: string; status: string }>(
      `/api/sessions/${sessionId}/messages`,
      { content },
    ),
  connectStream: (sessionId: string) =>
    new EventSource(`/api/sessions/${sessionId}/stream`),

  // Dashboard
  getDashboard: () => fetchJson<DashboardData>("/api/dashboard"),
  getCycles: (limit = 10) =>
    fetchJson<{ cycles: CycleSummary[] }>(`/api/dashboard/cycles?limit=${limit}`).then(
      (r) => r.cycles,
    ),

  // Review
  getReviewItems: () =>
    fetchJson<{ items: ReviewItem[] }>("/api/review").then((r) => r.items),
  approveReview: (id: string) => postJson(`/api/review/${id}/approve`),
  dismissReview: (id: string) => postJson(`/api/review/${id}/dismiss`),
  snoozeReview: (id: string, duration: string) =>
    postJson(`/api/review/${id}/snooze`, { duration }),

  // Tasks
  getTaskSummary: () => fetchJson<TaskSummary>("/api/tasks"),

  // Projects
  getProjectHealth: () => fetchJson<ProjectHealthReport[]>("/api/projects/health"),

  // Monitor
  connectMonitor: () => new EventSource("/api/monitor/stream"),
  triggerCycle: (agents?: string[]) =>
    postJson<{ cycle_id: string; status: string }>("/api/orchestrate/trigger", { agents }),
};
