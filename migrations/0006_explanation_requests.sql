-- Explanation jobs are durable and cancellable, but never save an analysis snapshot.
ALTER TABLE kaia_analysis_requests
  ADD COLUMN IF NOT EXISTS job_kind text NOT NULL DEFAULT 'analysis';
ALTER TABLE kaia_analysis_requests
  DROP CONSTRAINT IF EXISTS kaia_analysis_requests_kind_check;
ALTER TABLE kaia_analysis_requests
  ADD CONSTRAINT kaia_analysis_requests_kind_check CHECK (job_kind IN ('analysis','explanation'));
ALTER TABLE kaia_analysis_requests
  DROP CONSTRAINT IF EXISTS kaia_analysis_requests_terminal_check;
ALTER TABLE kaia_analysis_requests
  ADD CONSTRAINT kaia_analysis_requests_terminal_check CHECK (
    (state='completed' AND job_kind='analysis' AND analysis_id IS NOT NULL) OR
    (state='completed' AND job_kind='explanation' AND analysis_id IS NULL) OR
    (state IN ('running','cancelled') AND analysis_id IS NULL)
  );
