import type {
  CaptureItem,
  CaptureStatus,
  CaptureSummary,
  CaptureType,
  ChatSession,
  ChatSessionLite,
  CreateSessionRequest,
  CycleSummary,
  DashboardData,
  GitCommitInfo,
  ProjectHealthReport,
  ReviewItem,
  TaskSummary,
  TerminalSessionInfo,
  WorkspaceConfig,
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

async function putJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
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

  // Captures
  getCaptures: (type?: CaptureType, status?: CaptureStatus) => {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (status) params.set("status", status);
    const qs = params.toString();
    return fetchJson<{ captures: CaptureItem[] }>(`/api/captures${qs ? `?${qs}` : ""}`)
      .then((r) => r.captures);
  },
  getCaptureSummary: () => fetchJson<CaptureSummary>("/api/captures/summary"),
  updateCaptureStatus: (id: string, status: CaptureStatus, result?: string) =>
    postJson<{ ok: true }>(`/api/captures/${id}/status`, { status, result }),

  // Tasks
  getTaskSummary: () => fetchJson<TaskSummary>("/api/tasks"),

  // Projects
  getProjectHealth: () => fetchJson<ProjectHealthReport[]>("/api/projects/health"),

  // Monitor
  connectMonitor: () => new EventSource("/api/monitor/stream"),
  triggerCycle: (agents?: string[]) =>
    postJson<{ cycle_id: string; status: string }>("/api/orchestrate/trigger", { agents }),

  // Terminal / Workspaces
  getTerminalSessions: () =>
    fetchJson<{ sessions: TerminalSessionInfo[] }>("/api/terminal/sessions"),
  createTerminalSession: (req: CreateSessionRequest) =>
    postJson<TerminalSessionInfo>("/api/terminal/sessions", req),
  killTerminalSession: (id: string) => fetchDelete(`/api/terminal/sessions/${id}`),
  restartTerminalSession: (id: string) =>
    postJson<TerminalSessionInfo>(`/api/terminal/sessions/${id}/restart`),
  getWorkspaceConfig: () => fetchJson<WorkspaceConfig>("/api/terminal/config"),
  saveWorkspaceConfig: (config: WorkspaceConfig) =>
    putJson<{ ok: true }>("/api/terminal/config", config),
  getTerminalProjects: () =>
    fetchJson<{ projects: { id: string; name: string; path: string }[] }>("/api/terminal/projects")
      .then((r) => r.projects),
  getProjectGitInfo: (id: string) =>
    fetchJson<{ lastCommit: GitCommitInfo | null }>(`/api/terminal/projects/${id}/git-info`),
  getSessionRss: (id: string) =>
    fetchJson<{ sessionId: string; rssKb: number | null }>(`/api/terminal/sessions/${id}/rss`),
};
