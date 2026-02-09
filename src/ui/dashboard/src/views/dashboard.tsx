import { useEffect } from "preact/hooks";
import { api } from "../api";
import { useApi } from "../hooks/use-api";

function formatTimestamp(value?: string): string {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function DashboardView() {
  const dashboard = useApi(() => api.getDashboard(), []);
  const cycles = useApi(() => api.getCycles(8), []);

  useEffect(() => {
    const timer = setInterval(() => {
      dashboard.refetch();
      cycles.refetch();
    }, 15_000);
    return () => clearInterval(timer);
  }, [dashboard.refetch, cycles.refetch]);

  const taskSummary = dashboard.data?.task_summary;
  const agentHealth = dashboard.data?.agent_health
    ? Object.values(dashboard.data.agent_health)
    : [];
  const healthyAgents = agentHealth.filter((agent) => agent.last_ok).length;

  return (
    <div class="view-container">
      <div class="view-header">
        <h2>Dashboard</h2>
        <p>System overview from live backend APIs</p>
      </div>

      {(dashboard.loading || cycles.loading) && (
        <div class="card-detail">Loading dashboard data...</div>
      )}
      {(dashboard.error || cycles.error) && (
        <div class="card-detail" style={{ color: "var(--status-error)" }}>
          {dashboard.error ?? cycles.error}
        </div>
      )}

      <div class="card-grid">
        <div class="card">
          <div class="card-title">Last Cycle</div>
          <div class="card-value">
            {dashboard.data?.last_cycle ? dashboard.data.last_cycle.cycle_id : "None"}
          </div>
          <div class="card-detail">
            {dashboard.data?.last_cycle
              ? `${dashboard.data.last_cycle.trigger_type} - ${dashboard.data.last_cycle.surfaced_count} surfaced`
              : "No cycles recorded yet"}
          </div>
        </div>

        <div class="card">
          <div class="card-title">Review Queue</div>
          <div class="card-value">{dashboard.data?.review_pending ?? 0}</div>
          <div class="card-detail">Pending items for human review</div>
        </div>

        <div class="card">
          <div class="card-title">Task Board</div>
          <div class="card-value">
            {taskSummary
              ? `${taskSummary.queued}/${taskSummary.in_progress}/${taskSummary.done}`
              : "0/0/0"}
          </div>
          <div class="card-detail">Queued / In Progress / Done</div>
        </div>

        <div class="card">
          <div class="card-title">Agent Health</div>
          <div class="card-value">
            {agentHealth.length > 0 ? `${healthyAgents}/${agentHealth.length}` : "0/0"}
          </div>
          <div class="card-detail">Agents with successful latest run</div>
        </div>
      </div>

      <div class="card" style={{ marginTop: "16px" }}>
        <div class="card-title">Recent Cycles</div>
        {cycles.data && cycles.data.length > 0 ? (
          <div class="agent-actions">
            {cycles.data.map((cycle) => (
              <div key={cycle.cycle_id} class="action-line">
                <strong>{cycle.cycle_id}</strong> {cycle.trigger_type} | agents: {cycle.agents_spawned.length} | surfaced: {cycle.surfaced_count} | errors: {cycle.error_count} | {formatTimestamp(cycle.started_at)}
              </div>
            ))}
          </div>
        ) : (
          <div class="card-detail">No cycle history yet.</div>
        )}
      </div>
    </div>
  );
}
