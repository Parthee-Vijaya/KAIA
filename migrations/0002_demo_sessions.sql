-- Explicit public demo sessions are separate from local test fixtures and Entra sessions.
ALTER TABLE kaia_sessions ADD COLUMN IF NOT EXISTS demo_only integer NOT NULL DEFAULT 0;
ALTER TABLE kaia_sessions ADD COLUMN IF NOT EXISTS demo_profile text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='kaia_sessions_demo_mode_check') THEN
    ALTER TABLE kaia_sessions ADD CONSTRAINT kaia_sessions_demo_mode_check CHECK (
      (demo_only=0 AND demo_profile IS NULL) OR
      (demo_only=1 AND test_only=0 AND demo_profile IS NOT NULL AND demo_profile IN ('executive','school','council'))
    );
  END IF;
END $$;
