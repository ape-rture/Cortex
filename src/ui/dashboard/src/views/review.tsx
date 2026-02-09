import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { useApi } from "../hooks/use-api";

export function ReviewView() {
  const review = useApi(() => api.getReviewItems(), []);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      review.refetch();
    }, 20_000);
    return () => clearInterval(timer);
  }, [review.refetch]);

  const runAction = async (id: string, action: "approve" | "dismiss" | "snooze") => {
    setBusy((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setError(null);

    try {
      if (action === "approve") {
        await api.approveReview(id);
      } else if (action === "dismiss") {
        await api.dismissReview(id);
      } else {
        await api.snoozeReview(id, "1h");
      }
      review.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <div class="view-container">
      <div class="view-header">
        <h2>Review Queue</h2>
        <p>Items flagged by agents</p>
      </div>

      {review.loading && <div class="card-detail">Loading review items...</div>}
      {(review.error || error) && (
        <div class="card-detail" style={{ color: "var(--status-error)", marginBottom: "12px" }}>
          {review.error ?? error}
        </div>
      )}

      {review.data && review.data.length > 0 ? (
        <div class="review-list">
          {review.data.map((item) => {
            const pending = busy.has(item.id);
            return (
              <div key={item.id} class="review-item">
                <div class="review-item-header">
                  <span class={`urgency-badge ${item.urgency.toLowerCase()}`}>{item.urgency}</span>
                  <span class="review-item-summary">{item.summary}</span>
                </div>
                {item.detail && <div class="card-detail">{item.detail}</div>}
                <div class="review-item-meta">
                  agent: {item.agent} | salience: {item.salience.toFixed(2)} | created: {new Date(item.created_at).toLocaleString()}
                </div>

                <div class="review-actions">
                  <button
                    class="btn-action approve"
                    disabled={pending}
                    onClick={() => runAction(item.id, "approve")}
                  >
                    Approve
                  </button>
                  <button
                    class="btn-action"
                    disabled={pending}
                    onClick={() => runAction(item.id, "snooze")}
                  >
                    Snooze 1h
                  </button>
                  <button
                    class="btn-action dismiss"
                    disabled={pending}
                    onClick={() => runAction(item.id, "dismiss")}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div class="empty-state">
          <div class="empty-state-icon">&#x1F514;</div>
          <div class="empty-state-text">No items to review</div>
        </div>
      )}
    </div>
  );
}
