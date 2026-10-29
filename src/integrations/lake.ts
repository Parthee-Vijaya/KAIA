import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { AccessContext } from '../domain/types';
import { authorizeSource } from './policy';
import type { SourceRequest } from './types';
import { isRawRowManifest, restoreRawRows, type RawRowChunk } from './seed-snapshot';

export const POSTGRES_LAKE_DDL = `
CREATE TABLE IF NOT EXISTS kaia_lake_snapshots (
 id text PRIMARY KEY, source_id text NOT NULL, dataset_version text NOT NULL,
 observed_at timestamptz NOT NULL, retrieved_at timestamptz NOT NULL,
 schema_version text NOT NULL, content_hash text NOT NULL, raw_payload jsonb NOT NULL,
 entity_ids jsonb NOT NULL, row_count integer NOT NULL CHECK (row_count > 0),
 UNIQUE(source_id,dataset_version,observed_at)
);
CREATE TABLE IF NOT EXISTS kaia_lake_rows (
 snapshot_id text NOT NULL REFERENCES kaia_lake_snapshots(id),
 row_key text NOT NULL, entity_id text NOT NULL, period text NOT NULL, values_json jsonb NOT NULL,
 PRIMARY KEY(snapshot_id,row_key)
);
CREATE INDEX IF NOT EXISTS kaia_lake_rows_scope ON kaia_lake_rows(entity_id,period,snapshot_id);
CREATE TABLE IF NOT EXISTS kaia_lake_raw_chunks (
 snapshot_id text NOT NULL REFERENCES kaia_lake_snapshots(id),
 ordinal integer NOT NULL CHECK (ordinal >= 0), payload text NOT NULL,
 content_hash text NOT NULL, row_count integer NOT NULL CHECK (row_count > 0),
 PRIMARY KEY(snapshot_id,ordinal)
);
`;

const rowSchema = z
  .object({
    key: z.string().min(1).max(180),
    entityId: z.string().min(1).max(100),
    period: z.string().regex(/^20\d{2}(-(0[1-9]|1[0-2]))?$/),
    values: z.record(
      z.string().max(80),
      z.union([z.string().max(4000), z.number().finite(), z.boolean(), z.null()]),
    ),
  })
  .strict();
export type CuratedRow = z.infer<typeof rowSchema>;
export interface LakeSnapshot {
  id: string;
  sourceId: string;
  datasetVersion: string;
  observedAt: string;
  retrievedAt: string;
  schemaVersion: string;
  contentHash: string;
  rawPayload: unknown;
  entityIds: string[];
  rows: CuratedRow[];
}
export interface LakeAdapter {
  /** Implementations must commit raw snapshot and curated rows atomically. */
  put(snapshot: LakeSnapshot): Promise<'inserted' | 'unchanged'>;
  get(
    sourceId: string,
    datasetVersion: string,
    observedAt: string,
  ): Promise<LakeSnapshot | undefined>;
  readRows(sourceId: string, datasetVersion: string, unitIds: string[]): Promise<CuratedRow[]>;
}
export class SnapshotConflict extends Error {
  constructor() {
    super(
      'Kildedata er ændret under samme version og observationstid. Indlæs med en ny eksplicit dataversion.',
    );
    this.name = 'SnapshotConflict';
  }
}
function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value !== null)
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  throw new Error('Snapshot indeholder en ugyldig JSON-værdi.');
}
export function snapshotHash(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

export async function ingestSnapshot(
  input: {
    sourceId: string;
    datasetVersion: string;
    observedAt: string;
    retrievedAt: string;
    schemaVersion: string;
    rawPayload: unknown;
    rows: CuratedRow[];
  },
  access: AccessContext,
  request: SourceRequest,
  lake: LakeAdapter,
) {
  if (request.sourceId !== input.sourceId || request.operation !== 'ingest')
    throw new Error('Indlæsningen matcher ikke kildepolitikken.');
  authorizeSource(access, request);
  if (
    !/^[a-zA-Z0-9_.-]{1,100}$/.test(input.datasetVersion) ||
    !/^[a-zA-Z0-9_.-]{1,40}$/.test(input.schemaVersion)
  )
    throw new Error('Ugyldig data- eller skemaversion.');
  const observedAt = z.iso.datetime({ offset: true }).parse(input.observedAt);
  const retrievedAt = z.iso.datetime({ offset: true }).parse(input.retrievedAt);
  if (Date.parse(observedAt) > Date.parse(retrievedAt))
    throw new Error('Observationstid kan ikke ligge efter hentetidspunkt.');
  const rows = z.array(rowSchema).min(1).max(500_000).parse(input.rows);
  if (new Set(rows.map((row) => row.key)).size !== rows.length)
    throw new Error('Der er dublerede rækkenøgler i indlæsningen.');
  if (rows.some((row) => !request.unitIds.includes(row.entityId)))
    throw new Error('Indlæsningen indeholder enheder uden for den godkendte afgrænsning.');
  const fromYear = request.periodRange?.fromYear ?? request.period.year,
    toYear = request.periodRange?.toYear ?? request.period.year;
  if (
    rows.some(
      (row) =>
        Number(row.period.slice(0, 4)) < fromYear ||
        Number(row.period.slice(0, 4)) > toYear ||
        (row.period.length > 4 &&
          (Number(row.period.slice(5, 7)) < request.period.fromMonth ||
            Number(row.period.slice(5, 7)) > request.period.toMonth)),
    )
  )
    throw new Error('Indlæsningen indeholder en periode uden for den godkendte afgrænsning.');
  const contentHash = snapshotHash({
    rawPayload: input.rawPayload,
    rows,
    schemaVersion: input.schemaVersion,
  });
  const id = `lake-${snapshotHash([input.sourceId, input.datasetVersion, observedAt]).slice(0, 32)}`;
  const result = await lake.put({
    ...input,
    observedAt,
    retrievedAt,
    rows,
    contentHash,
    id,
    entityIds: [...new Set(rows.map((row) => row.entityId))],
  });
  return { id, result, contentHash, rowCount: rows.length };
}

/** Raw data may span several units, so exporting raw requires access to every included unit. */
export async function readRawSnapshot(
  lake: LakeAdapter,
  access: AccessContext,
  request: SourceRequest,
  version: string,
  observedAt: string,
) {
  authorizeSource(access, { ...request, operation: 'export' });
  const snapshot = await lake.get(request.sourceId, version, observedAt);
  if (snapshot && snapshot.entityIds.some((id) => !request.unitIds.includes(id)))
    throw new Error(
      'Rå snapshot indeholder enheder uden for din adgang. Brug det filtrerede udtræk.',
    );
  return snapshot;
}
export async function readCuratedRows(
  lake: LakeAdapter,
  access: AccessContext,
  request: SourceRequest,
  version: string,
) {
  authorizeSource(access, request);
  const rows = await lake.readRows(request.sourceId, version, request.unitIds);
  const fromYear = request.periodRange?.fromYear ?? request.period.year,
    toYear = request.periodRange?.toYear ?? request.period.year;
  return rows.filter(
    (row) =>
      request.unitIds.includes(row.entityId) &&
      Number(row.period.slice(0, 4)) >= fromYear &&
      Number(row.period.slice(0, 4)) <= toYear &&
      (row.period.length === 4 ||
        (Number(row.period.slice(5, 7)) >= request.period.fromMonth &&
          Number(row.period.slice(5, 7)) <= request.period.toMonth)),
  );
}

/** Test fixture only. Production code must pass PostgresLakeAdapter or another durable implementation. */
export class FixtureLakeAdapter implements LakeAdapter {
  private snapshots = new Map<string, LakeSnapshot>();
  private key(sourceId: string, version: string, observedAt: string) {
    return `${sourceId}:${version}:${observedAt}`;
  }
  async put(snapshot: LakeSnapshot): Promise<'inserted' | 'unchanged'> {
    const key = this.key(snapshot.sourceId, snapshot.datasetVersion, snapshot.observedAt);
    const old = this.snapshots.get(key);
    if (old && old.contentHash !== snapshot.contentHash) throw new SnapshotConflict();
    if (old) return 'unchanged';
    if (
      [...this.snapshots.values()].some(
        (existing) =>
          existing.sourceId === snapshot.sourceId &&
          existing.datasetVersion === snapshot.datasetVersion &&
          existing.rows.some((row) => snapshot.rows.some((next) => next.key === row.key)),
      )
    )
      throw new SnapshotConflict();
    this.snapshots.set(key, structuredClone(snapshot));
    return 'inserted';
  }
  async get(sourceId: string, version: string, observedAt: string) {
    const snapshot = this.snapshots.get(this.key(sourceId, version, observedAt));
    return snapshot ? structuredClone(snapshot) : undefined;
  }
  async readRows(sourceId: string, version: string, unitIds: string[]) {
    return [...this.snapshots.values()]
      .filter((snapshot) => snapshot.sourceId === sourceId && snapshot.datasetVersion === version)
      .flatMap((snapshot) => snapshot.rows)
      .filter((row) => unitIds.includes(row.entityId))
      .map((row) => structuredClone(row));
  }
}
export interface SqlExecutor {
  query<T extends Record<string, unknown>>(query: string, values: unknown[]): Promise<T[]>;
  transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}
export class PostgresLakeAdapter implements LakeAdapter {
  constructor(private readonly sql: SqlExecutor) {}
  async put(snapshot: LakeSnapshot): Promise<'inserted' | 'unchanged'> {
    return this.sql.transaction(async (tx) => {
      // Serialize imports for one immutable source version, including concurrent jobs.
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `${snapshot.sourceId}:${snapshot.datasetVersion}`,
      ]);
      const rows = await tx.query<{ id: string }>(
        `INSERT INTO kaia_lake_snapshots (id,source_id,dataset_version,observed_at,retrieved_at,schema_version,content_hash,raw_payload,entity_ids,row_count) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10) ON CONFLICT (source_id,dataset_version,observed_at) DO NOTHING RETURNING id`,
        [
          snapshot.id,
          snapshot.sourceId,
          snapshot.datasetVersion,
          snapshot.observedAt,
          snapshot.retrievedAt,
          snapshot.schemaVersion,
          snapshot.contentHash,
          JSON.stringify(snapshot.rawPayload),
          JSON.stringify(snapshot.entityIds),
          snapshot.rows.length,
        ],
      );
      if (rows.length === 0) {
        const existing = await tx.query<{ content_hash: string }>(
          'SELECT content_hash FROM kaia_lake_snapshots WHERE source_id=$1 AND dataset_version=$2 AND observed_at=$3',
          [snapshot.sourceId, snapshot.datasetVersion, snapshot.observedAt],
        );
        if (existing[0]?.content_hash !== snapshot.contentHash) throw new SnapshotConflict();
        return 'unchanged';
      }
      const overlap = await tx.query<{ row_key: string }>(
        'SELECT r.row_key FROM kaia_lake_rows r JOIN kaia_lake_snapshots s ON s.id=r.snapshot_id WHERE s.source_id=$1 AND s.dataset_version=$2 AND r.row_key IN (SELECT jsonb_array_elements_text($3::jsonb)) LIMIT 1',
        [
          snapshot.sourceId,
          snapshot.datasetVersion,
          JSON.stringify(snapshot.rows.map((row) => row.key)),
        ],
      );
      if (overlap.length) throw new SnapshotConflict();
      // jsonb_to_recordset avoids one network round-trip per ledger row.
      await tx.query(
        `INSERT INTO kaia_lake_rows (snapshot_id,row_key,entity_id,period,values_json) SELECT $1,r.key,r."entityId",r.period,r."values" FROM jsonb_to_recordset($2::jsonb) AS r(key text,"entityId" text,period text,"values" jsonb)`,
        [snapshot.id, JSON.stringify(snapshot.rows)],
      );
      return 'inserted';
    });
  }
  async get(
    sourceId: string,
    version: string,
    observedAt: string,
  ): Promise<LakeSnapshot | undefined> {
    const rows = await this.sql.query<{
      id: string;
      source_id: string;
      dataset_version: string;
      observed_at: Date | string;
      retrieved_at: Date | string;
      schema_version: string;
      content_hash: string;
      raw_payload: unknown;
      entity_ids: string[];
    }>(
      'SELECT * FROM kaia_lake_snapshots WHERE source_id=$1 AND dataset_version=$2 AND observed_at=$3',
      [sourceId, version, observedAt],
    );
    const row = rows[0];
    if (!row) return undefined;
    const rawPayload = isRawRowManifest(row.raw_payload)
      ? restoreRawRows(
          row.raw_payload,
          await this.sql.query<RawRowChunk & Record<string, unknown>>(
            'SELECT ordinal,payload,content_hash,row_count FROM kaia_lake_raw_chunks WHERE snapshot_id=$1 ORDER BY ordinal',
            [row.id],
          ),
        )
      : row.raw_payload;
    const curated = await this.sql.query<{
      key: string;
      entityId: string;
      period: string;
      values: CuratedRow['values'];
    }>(
      'SELECT row_key AS key,entity_id AS "entityId",period,values_json AS values FROM kaia_lake_rows WHERE snapshot_id=$1 ORDER BY row_key',
      [row.id],
    );
    return {
      id: row.id,
      sourceId: row.source_id,
      datasetVersion: row.dataset_version,
      observedAt: new Date(row.observed_at).toISOString(),
      retrievedAt: new Date(row.retrieved_at).toISOString(),
      schemaVersion: row.schema_version,
      contentHash: row.content_hash,
      rawPayload,
      entityIds: row.entity_ids,
      rows: curated,
    };
  }
  async readRows(sourceId: string, version: string, unitIds: string[]) {
    return this.sql.query<{
      key: string;
      entityId: string;
      period: string;
      values: CuratedRow['values'];
    }>(
      'SELECT r.row_key AS key,r.entity_id AS "entityId",r.period,r.values_json AS values FROM kaia_lake_rows r JOIN kaia_lake_snapshots s ON s.id=r.snapshot_id WHERE s.source_id=$1 AND s.dataset_version=$2 AND r.entity_id=ANY($3::text[]) ORDER BY r.period,r.row_key',
      [sourceId, version, unitIds],
    );
  }
}
