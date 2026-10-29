-- Durable cancellation survives a browser disconnect, proxy buffering and process changes.
CREATE TABLE IF NOT EXISTS kaia_analysis_requests (
  request_id uuid PRIMARY KEY,
  owner_id text NOT NULL REFERENCES kaia_users(id),
  state text NOT NULL CHECK (state IN ('running','cancelled','completed')),
  analysis_id text REFERENCES kaia_analyses(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kaia_analysis_requests_terminal_check CHECK (
    (state='completed' AND analysis_id IS NOT NULL) OR
    (state IN ('running','cancelled') AND analysis_id IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS kaia_analysis_requests_owner_idx
  ON kaia_analysis_requests(owner_id,updated_at);
