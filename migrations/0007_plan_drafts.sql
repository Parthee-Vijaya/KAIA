CREATE TABLE IF NOT EXISTS kaia_plan_drafts (
  id text PRIMARY KEY,
  owner_id text NOT NULL REFERENCES kaia_users(id),
  analysis_id text NOT NULL REFERENCES kaia_analyses(id),
  fingerprint text NOT NULL,
  state text NOT NULL CHECK (state IN ('pending','approved')),
  draft jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  UNIQUE(owner_id, analysis_id),
  CHECK ((state='approved' AND approved_at IS NOT NULL) OR (state='pending' AND approved_at IS NULL))
);
CREATE INDEX IF NOT EXISTS kaia_plan_drafts_owner ON kaia_plan_drafts(owner_id,analysis_id);
