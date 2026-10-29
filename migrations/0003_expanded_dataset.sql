ALTER TABLE kaia_datasets ADD COLUMN IF NOT EXISTS coverage jsonb NOT NULL DEFAULT '{"fromYear":2023,"toYear":2028}';
ALTER TABLE kaia_datasets ADD COLUMN IF NOT EXISTS municipal_metadata jsonb;
CREATE TABLE IF NOT EXISTS kaia_municipal_profiles(dataset_version text NOT NULL,id text NOT NULL,data jsonb NOT NULL,PRIMARY KEY(dataset_version,id));
CREATE TABLE IF NOT EXISTS kaia_municipal_benchmarks(dataset_version text NOT NULL,id text NOT NULL,municipality_id text NOT NULL,area text NOT NULL,year integer NOT NULL,month integer NOT NULL CHECK(month BETWEEN 1 AND 12),kind text NOT NULL,data jsonb NOT NULL,PRIMARY KEY(dataset_version,id));
CREATE INDEX IF NOT EXISTS kaia_municipal_scope_idx ON kaia_municipal_benchmarks(dataset_version,area,year,municipality_id);
