CREATE TABLE IF NOT EXISTS kaia_lake_raw_chunks (
 snapshot_id text NOT NULL REFERENCES kaia_lake_snapshots(id),
 ordinal integer NOT NULL CHECK (ordinal >= 0),
 payload text NOT NULL,
 content_hash text NOT NULL,
 row_count integer NOT NULL CHECK (row_count > 0),
 PRIMARY KEY(snapshot_id,ordinal)
);
