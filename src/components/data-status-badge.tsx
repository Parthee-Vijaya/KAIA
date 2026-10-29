import './data-status-badge.css';

/** Mount once per screen; provider and login mode are displayed separately. */
export function DataStatusBadge() {
  return (
    <div className="kaia-data-status" role="note">
      Simulerede data
    </div>
  );
}
