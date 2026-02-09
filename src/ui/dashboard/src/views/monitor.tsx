import { useEffect, useMemo, useState } from "preact/hooks";
import { api } from "../api";
import { useSSE } from "../hooks/use-sse";
import type { AgentAction, AgentLiveState, CycleSummary } from "../types";

type StartedPayload = {
  agent: string;
  cycle_id: string;
  timestamp: string;
};

type ActionPayload = {
  agent: string;
  cycle_id: string;
  phase: string;
  elapsed_ms: number;
  action: {
    kind: string;
    label: string;
    detail?: string;
  };
};

type CompletedPayload = {
  agent: string;
  cycle_id: string;
  timestamp: string;
  ok: boolean;
  error?: string;
  usage?: {
    latency_ms: number;
  };
  output?: {
    findings?: Array<{ type: string; summary: string; urgency: string }>;
    errors?: string[];
  };
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function toStarted(data: unknown): StartedPayload | null {
  const v = asRecord(data);
  if (!v) return null;
  if (typeof v.agent !== "string" || typeof v.cycle_id !== "string") return null;
  return {
    agent: v.agent,
    cycle_id: v.cycle_id,
    timestamp: typeof v.timestamp === "string" ? v.timestamp : new Date().toISOString(),
  };
}

function toAction(data: unknown): ActionPayload | null {
  const v = asRecord(data);
  const action = asRecord(v?.action);
  if (!v || !action) return null;
  if (typeof v.agent !== "string" || typeof v.cycle_id !== "string") return null;
  if (typeof action.kind !== "string" || typeof action.label !== "string") return null;

  return {
    agent: v.agent,
    cycle_id: v.cycle_id,
    phase: typeof v.phase === "string" ? v.phase : "updated",
    elapsed_ms: typeof v.elapsed_ms === "number" ? v.elapsed_ms : 0,
    action: {
      kind: action.kind,
      label: action.label,
      detail: typeof action.detail === "string" ? action.detail : undefined,
    },
  };
}

function toCompleted(data: unknown): CompletedPayload | null {
  const v = asRecord(data);
  if (!v) return null;
  if (typeof v.agent !== "string" || typeof v.cycle_id !== "string") return null;
  if (typeof v.ok !== "boolean") return null;

  const usage = asRecord(v.usage);
  const output = asRecord(v.output);
  const findings = Array.isArray(output?.findings)
    ? output.findings
        .map((item) => asRecord(item))
        .filter((item): item is Record<string, unknown> => item !== null)
        .map((item) => ({
          type: String(item.type ?? "insight"),
          summary: String(item.summary ?? ""),
          urgency: String(item.urgency ?? "low"),
        }))
    : [];
  const errors = Array.isArray(output?.errors) ? output.errors.map(String) : [];

  return {
    agent: v.agent,
    cycle_id: v.cycle_id,
    timestamp: typeof v.timestamp === "string" ? v.timestamp : new Date().toISOString(),
    ok: v.ok,
    error: typeof v.error === "string" ? v.error : undefined,
    usage: usage && typeof usage.latency_ms === "number"
      ? { latency_ms: usage.latency_ms }
      : undefined,
    output: { findings, errors },
  };
}

function toCycleSummary(data: unknown): CycleSummary | null {
  const v = asRecord(data);
  if (!v) return null;
  if (typeof v.cycle_id !== "string" || typeof v.started_at !== "string") return null;

  return {
    cycle_id: v.cycle_id,
    started_at: v.started_at,
    completed_at: typeof v.completed_at === "string" ? v.completed_at : undefined,
    trigger_type: typeof v.trigger_type === "string" ? v.trigger_type : "cli",
    agents_spawned: Array.isArray(v.agents_spawned) ? v.agents_spawned.map(String) : [],
    finding_count: typeof v.finding_count === "number" ? v.finding_count : 0,
    surfaced_count: typeof v.surfaced_count === "number" ? v.surfaced_count : 0,
    error_count: typeof v.error_count === "number" ? v.error_count : 0,
  };
}

function formatTimestamp(value?: string): string {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString();
}

export function MonitorView() {
  const [activeAgents, setActiveAgents] = useState<Map<string, AgentLiveState>>(new Map());
  const [cycleHistory, setCycleHistory] = useState<CycleSummary[]>([]);
  const [monitorConnected, setMonitorConnected] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getCycles(10)
      .then((cycles) => setCycleHistory(cycles))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useSSE(
    "/api/monitor/stream",
    {
      heartbeat: () => {
        setMonitorConnected(true);
      },

      agent_started: (data) => {
        setMonitorConnected(true);
        const payload = toStarted(data);
        if (!payload) return;

        setActiveAgents((prev) => {
          const next = new Map(prev);
          next.set(payload.agent, {
            agent: payload.agent,
            cycle_id: payload.cycle_id,
            status: "running",
            started_at: payload.timestamp,
            actions: [],
            findings: [],
          });
          return next;
        });
      },

      agent_action: (data) => {
        setMonitorConnected(true);
        const payload = toAction(data);
        if (!payload) return;

        setActiveAgents((prev) => {
          const next = new Map(prev);
          const existing = next.get(payload.agent) ?? {
            agent: payload.agent,
            cycle_id: payload.cycle_id,
            status: "running" as const,
            started_at: new Date().toISOString(),
            actions: [],
            findings: [],
          };

          const action: AgentAction = {
            kind: payload.action.kind,
            label: payload.action.label,
            detail: payload.action.detail,
            phase: payload.phase,
            elapsed_ms: payload.elapsed_ms,
          };

          next.set(payload.agent, {
            ...existing,
            actions: [...existing.actions, action].slice(-12),
          });
          return next;
        });
      },

      agent_completed: (data) => {
        setMonitorConnected(true);
        const payload = toCompleted(data);
        if (!payload) return;

        setActiveAgents((prev) => {
          const next = new Map(prev);
          const existing = next.get(payload.agent) ?? {
            agent: payload.agent,
            cycle_id: payload.cycle_id,
            status: "running" as const,
            started_at: payload.timestamp,
            actions: [],
            findings: [],
          };

          next.set(payload.agent, {
            ...existing,
            status: payload.ok ? "completed" : "failed",
            latency_ms: payload.usage?.latency_ms,
            error: payload.error ?? payload.output?.errors?.join("; "),
            findings: (payload.output?.findings ?? []).map((f) => ({ ...f, salience: 0 })),
          });
          return next;
        });
      },

      cycle_complete: (data) => {
        setMonitorConnected(true);
        const cycle = toCycleSummary(data);
        if (!cycle) return;

        setCycleHistory((prev) => {
          const without = prev.filter((item) => item.cycle_id !== cycle.cycle_id);
          return [cycle, ...without].slice(0, 20);
        });
      },
    },
    [],
  );

  const sortedAgents = useMemo(
    () => Array.from(activeAgents.values()).sort((a, b) => a.agent.localeCompare(b.agent)),
    [activeAgents],
  );

  const triggerCycle = async () => {
    setTriggering(true);
    setError(null);
    try {
      await api.triggerCycle();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div class="view-container">
      <div class="view-header">
        <h2>Agent Monitor</h2>
        <p>Live orchestrator events and cycle history</p>
      </div>

      <div style={{ marginBottom: "12px" }}>
        <button class="btn-trigger" onClick={triggerCycle} disabled={triggering}>
          {triggering ? "Triggering..." : "Trigger Cycle"}
        </button>
        <span style={{ marginLeft: "12px", color: "var(--text-secondary)", fontSize: "12px" }}>
          {monitorConnected ? "SSE connected" : "Waiting for stream..."}
        </span>
      </div>

      {error && (
        <div class="card-detail" style={{ color: "var(--status-error)", marginBottom: "12px" }}>
          {error}
        </div>
      )}

      {sortedAgents.length === 0 ? (
        <div class="empty-state" style={{ height: "220px" }}>
          <div class="empty-state-icon">&#x1F50D;</div>
          <div class="empty-state-text">No agent activity yet</div>
        </div>
      ) : (
        <div class="agent-cards">
          {sortedAgents.map((agent) => (
            <div key={agent.agent} class="agent-card">
              <div class="agent-card-header">
                <div class="agent-card-name">{agent.agent}</div>
                <div class={`agent-card-status ${agent.status}`}>{agent.status}</div>
              </div>
              <div class="card-detail">
                cycle: {agent.cycle_id} | started: {formatTimestamp(agent.started_at)}
                {typeof agent.latency_ms === "number" ? ` | latency: ${agent.latency_ms}ms` : ""}
              </div>
              {agent.error && (
                <div class="card-detail" style={{ color: "var(--status-error)", marginTop: "6px" }}>
                  {agent.error}
                </div>
              )}
              {agent.actions.length > 0 && (
                <div class="agent-actions">
                  {agent.actions.slice(-6).map((action, idx) => (
                    <div key={`${action.kind}-${idx}`} class="action-line">
                      {action.kind}: {action.label} ({action.phase})
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div class="card" style={{ marginTop: "16px" }}>
        <div class="card-title">Recent Cycles</div>
        {cycleHistory.length > 0 ? (
          <div class="agent-actions">
            {cycleHistory.map((cycle) => (
              <div key={cycle.cycle_id} class="action-line">
                {cycle.cycle_id} | {cycle.trigger_type} | agents: {cycle.agents_spawned.length}
                {" | "}surfaced: {cycle.surfaced_count} | errors: {cycle.error_count}
              </div>
            ))}
          </div>
        ) : (
          <div class="card-detail">No cycles yet.</div>
        )}
      </div>
    </div>
  );
}
