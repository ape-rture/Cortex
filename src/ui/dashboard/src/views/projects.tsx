import { useEffect } from "preact/hooks";
import { api } from "../api";
import { useApi } from "../hooks/use-api";
import type { ProjectHealthReport } from "../types";

type HealthLevel = "green" | "yellow" | "red";

function getHealth(report: ProjectHealthReport): HealthLevel {
  if (report.error) return "red";
  if (report.daysSinceLastCommit > 14) return "red";
  if (report.daysSinceLastCommit > 7) return "yellow";
  if (report.unpushedCommitCount > 0) return "yellow";
  if (report.staleBranchCount > 0) return "yellow";
  return "green";
}

function summarize(report: ProjectHealthReport): string {
  if (report.error) return report.error;
  const pieces: string[] = [];
  pieces.push(`${report.daysSinceLastCommit}d since commit`);
  pieces.push(`${report.unpushedCommitCount} unpushed`);
  pieces.push(`${report.staleBranchCount} stale branches`);
  return pieces.join(" | ");
}

function healthLabel(health: HealthLevel): string {
  if (health === "green") return "Healthy";
  if (health === "yellow") return "Warning";
  return "Critical";
}

export function ProjectsView() {
  const projects = useApi(() => api.getProjectHealth(), []);

  useEffect(() => {
    const timer = setInterval(() => {
      projects.refetch();
    }, 20_000);
    return () => clearInterval(timer);
  }, [projects.refetch]);

  const reports = projects.data ?? [];
  const sorted = [...reports].sort((a, b) => {
    const rank = (item: ProjectHealthReport): number => {
      const health = getHealth(item);
      if (health === "red") return 0;
      if (health === "yellow") return 1;
      return 2;
    };
    return rank(a) - rank(b);
  });

  return (
    <div class="view-container">
      <div class="view-header">
        <h2>Projects</h2>
        <p>Live project heartbeat from tracked active repositories</p>
      </div>

      {projects.loading && <div class="card-detail">Loading project health...</div>}
      {projects.error && (
        <div class="card-detail" style={{ color: "var(--status-error)", marginBottom: "12px" }}>
          {projects.error}
        </div>
      )}

      {sorted.length === 0 && !projects.loading ? (
        <div class="empty-state">
          <div class="empty-state-icon">P</div>
          <div class="empty-state-text">No active projects found</div>
        </div>
      ) : (
        <div class="card-grid">
          {sorted.map((report) => {
            const health = getHealth(report);
            return (
              <div key={report.projectId} class={`card project-card ${health}`}>
                <div class="project-card-top">
                  <div class="card-title">{report.projectName}</div>
                  <div class={`health-pill ${health}`}>{healthLabel(health)}</div>
                </div>
                <div class="card-detail">branch: {report.currentBranch}</div>
                <div class="card-detail">{summarize(report)}</div>
                <div class="card-detail">{report.projectPath}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
