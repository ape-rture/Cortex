export function ReviewView() {
  return (
    <div class="view-container">
      <div class="view-header">
        <h2>Review Queue</h2>
        <p>Items flagged by agents — requires backend API endpoints (Phase 2)</p>
      </div>
      <div class="empty-state">
        <div class="empty-state-icon">&#x1F514;</div>
        <div class="empty-state-text">No items to review</div>
      </div>
    </div>
  );
}
