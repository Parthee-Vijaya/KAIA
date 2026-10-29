import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { sql, closeDb } from '../src/server/db';
import { postgresLake } from '../src/server/lake';
import { ingestSnapshot, readCuratedRows, readRawSnapshot } from '../src/integrations/lake';
import type { AccessContext } from '../src/domain/types';
import type { SourceRequest } from '../src/integrations/types';

const enabled = process.env.KAIA_DB_TEST === '1';
const version = `lake-contract-${randomUUID()}`;
const school = 'school-herredsaasen',
  otherSchool = 'school-nyrup';
const user: AccessContext = {
  userId: 'local-lake-verification',
  tenantId: 'test-tenant',
  objectId: 'test-object',
  displayName: 'Økonomikonsulent',
  title: 'Økonomikonsulent',
  roles: ['KAIA.Finance'],
  unitIds: [school],
  areas: ['schools'],
};
const admin: AccessContext = { ...user, roles: ['KAIA.Admin'], unitIds: [school, otherSchool] };
const request: SourceRequest = {
  sourceId: 'demo-ledger',
  operation: 'ingest',
  area: 'schools',
  unitIds: admin.unitIds,
  period: { year: 2026, fromMonth: 1, toMonth: 9 },
};
const readRequest: SourceRequest = { ...request, operation: 'aggregate', unitIds: user.unitIds };
const input = {
  sourceId: 'demo-ledger',
  datasetVersion: version,
  observedAt: '2026-09-30T00:00:00Z',
  retrievedAt: '2026-10-20T00:00:00Z',
  schemaVersion: '1',
  rawPayload: { simulated: true, importedBy: 'local-lake-verification' },
  rows: [
    { key: 'local-lake-1', entityId: school, period: '2026-09', values: { amountOre: 10500 } },
    { key: 'local-lake-2', entityId: otherSchool, period: '2026-09', values: { amountOre: 7200 } },
  ],
};

describe.skipIf(!enabled)('Actual local Postgres lake adapter with access-filtered service', () => {
  beforeAll(() => {
    config({ path: '.env.local', quiet: true });
    const url = new URL(process.env.DATABASE_URL || '');
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '55432')
      throw new Error(
        'Denne prøve er begrænset til den eksplicitte lokale testdatabase på port 55432.',
      );
  });
  afterAll(async () => {
    await sql()`DELETE FROM kaia_lake_rows WHERE snapshot_id IN (SELECT id FROM kaia_lake_snapshots WHERE dataset_version=${version})`;
    await sql()`DELETE FROM kaia_lake_snapshots WHERE dataset_version=${version}`;
    await closeDb();
  });
  it('writes raw and curated JSONB once and rejects silently changed evidence', async () => {
    const lake = postgresLake();
    expect((await ingestSnapshot(input, admin, request, lake)).result).toBe('inserted');
    expect((await ingestSnapshot(input, admin, request, lake)).result).toBe('unchanged');
    const raw = await readRawSnapshot(lake, admin, request, version, input.observedAt);
    expect(raw?.rawPayload).toEqual(input.rawPayload);
    expect(raw?.rows).toEqual(input.rows);
    await expect(
      ingestSnapshot(
        { ...input, rawPayload: { simulated: true, changed: true } },
        admin,
        request,
        lake,
      ),
    ).rejects.toThrow(/ændret/);
  });
  it('filters actual SQL rows and blocks a mixed-scope raw export', async () => {
    const lake = postgresLake();
    expect((await readCuratedRows(lake, user, readRequest, version)).map((row) => row.key)).toEqual(
      ['local-lake-1'],
    );
    await expect(
      readRawSnapshot(lake, user, readRequest, version, input.observedAt),
    ).rejects.toThrow(/Rå snapshot/);
    await expect(
      readCuratedRows(lake, user, { ...readRequest, unitIds: [otherSchool] }, version),
    ).rejects.toThrow();
  });
  it('rolls back a conflicting second snapshot and leaves row counts intact', async () => {
    const lake = postgresLake();
    await expect(
      ingestSnapshot({ ...input, observedAt: '2026-09-29T00:00:00Z' }, admin, request, lake),
    ).rejects.toThrow(/ændret/);
    const [snapshots] =
      await sql()`SELECT count(*) AS count FROM kaia_lake_snapshots WHERE dataset_version=${version}`;
    const [rows] =
      await sql()`SELECT count(*) AS count FROM kaia_lake_rows WHERE snapshot_id IN (SELECT id FROM kaia_lake_snapshots WHERE dataset_version=${version})`;
    expect(Number(snapshots.count)).toBe(1);
    expect(Number(rows.count)).toBe(2);
  });
});
