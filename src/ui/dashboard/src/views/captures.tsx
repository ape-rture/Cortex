import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { useApi } from "../hooks/use-api";
import type { CaptureItem, CaptureType, CaptureStatus } from "../types";

const TYPE_TABS: { label: string; value: CaptureType | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Task", value: "task" },
  { label: "Research", value: "research" },
  { label: "Content", value: "content" },
  { label: "Feature", value: "feature" },
  { label: "Seed", value: "seed" },
];

const STATUS_COLUMNS: { label: string; status: CaptureStatus; color: string }[] = [
  { label: "Queued", status: "queued", color: "var(--accent)" },
  { label: "In Progress", status: "in_progress", color: "var(--status-warn)" },
  { label: "Blocked", status: "blocked", color: "var(--status-error)" },
  { label: "Done", status: "done", color: "var(--status-ok)" },
  { label: "Failed", status: "failed", color: "var(--status-error)" },
  { label: "Cancelled", status: "cancelled", color: "var(--status-idle)" },
];

const TYPE_COLORS: Record<CaptureType, string> = {
  task: "var(--accent)",
  research: "#a78bfa",
  content: "#f59e0b",
  feature: "#10b981",
  seed: "#ec4899",
};

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function groupByStatus(captures: CaptureItem[]): Record<string, CaptureItem[]> {
  const groups: Record<string, CaptureItem[]> = {};
  for (const c of captures) {
    (groups[c.status] ??= []).push(c);
  }
  return groups;
}

export function CapturesView() {
  const [typeFilter, setTypeFilter] = useState<CaptureType | "all">("all");
  const captures = useApi(
    () => api.getCaptures(typeFilter === "all" ? undefined : typeFilter),
    [typeFilter],
  );
  const summary = useApi(() => api.getCaptureSummary(), []);

  useEffect(() => {
    const timer = setInterval(() => {
      captures.refetch();
      summary.refetch();
    }, 15_000);
    return () => clearInterval(timer);
  }, [captures.refetch, summary.refetch]);

  const grouped = captures.data ? groupByStatus([...captures.data]) : {};
  const activeColumns = STATUS_COLUMNS.filter((col) => grouped[col.status]?.length);

  return (
    <div class="view-container">
      <div class="view-header">
        <h2>Captures</h2>
        <p>Unified capture inbox — tasks, research, features, content, seeds</p>
      </div>

      {/* Summary cards */}
      {summary.data && (
        <div class="card-grid" style={{ marginBottom: 20 }}>
          <div class="card">
            <div class="card-title">Total</div>
            <div class="card-value">{summary.data.total}</div>
          </div>
          {TYPE_TABS.filter((t) => t.value !== "all").map((t) => (
            <div class="card" key={t.value}>
              <div class="card-title" style={{ color: TYPE_COLORS[t.value as CaptureType] }}>
                {t.label}
              </div>
              <div class="card-value">
                {summary.data!.by_type[t.value] ?? 0}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Type filter tabs */}
      <div class="capture-type-tabs">
        {TYPE_TABS.map((tab) => (
          <button
            key={tab.value}
            class={`capture-type-tab${typeFilter === tab.value ? " active" : ""}`}
            onClick={() => setTypeFilter(tab.value)}
          >
            {tab.label}
            {tab.value !== "all" && summary.data?.by_type[tab.value]
              ? ` (${summary.data.by_type[tab.value]})`
              : ""}
          </button>
        ))}
      </div>

      {captures.loading && <div class="card-detail">Loading captures...</div>}
      {captures.error && (
        <div class="card-detail" style={{ color: "var(--status-error)", marginBottom: 12 }}>
          {captures.error}
        </div>
      )}

      {/* Kanban columns */}
      {captures.data && activeColumns.length > 0 ? (
        <div class="capture-columns">
          {activeColumns.map((col) => (
            <div class="capture-column" key={col.status}>
              <div class="capture-column-header">
                <span class="status-dot" style={{ background: col.color }} />
                {col.label}
                <span class="capture-column-count">{grouped[col.status]?.length ?? 0}</span>
              </div>
              <div class="capture-column-items">
                {(grouped[col.status] ?? []).map((item) => (
                  <CaptureCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        !captures.loading && (
          <div class="empty-state">
            <div class="empty-state-icon">&#x1F4E5;</div>
            <div class="empty-state-text">No captures found</div>
          </div>
        )
      )}
    </div>
  );
}

function CaptureCard({ item }: { item: CaptureItem }) {
  return (
    <div class="capture-card">
      <div class="capture-card-header">
        <span
          class="capture-type-badge"
          style={{ color: TYPE_COLORS[item.capture_type], borderColor: TYPE_COLORS[item.capture_type] }}
        >
          {item.capture_type}
        </span>
        <span class="capture-priority">{item.priority}</span>
      </div>
      <div class="capture-card-title">{item.title}</div>
      {item.description && (
        <div class="capture-card-desc">{item.description}</div>
      )}
      <div class="capture-card-meta">
        {item.source} · {formatDate(item.created_at)}
        {item.tags && item.tags.length > 0 && (
          <span> · {item.tags.join(", ")}</span>
        )}
      </div>
    </div>
  );
}
