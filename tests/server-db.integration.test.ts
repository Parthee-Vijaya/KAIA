import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { sql, closeDb } from '../src/server/db';
import { accessForToken, createSession } from '../src/server/auth';
import {
  loadDataset,
  loadDatasetShell,
  ownedAnalysis,
  saveAnalysis,
  conversation,
  lists,
} from '../src/server/repository';
import { analyze, parseQuestion } from '../src/domain/analysis';
import { buildIllustration } from '../src/domain/illustrations';
import { snapshotHash, type LakeSnapshot } from '../src/integrations/lake';
import { postgresLake } from '../src/server/lake';
import { rawRowChunks, rawRowManifest } from '../src/integrations/seed-snapshot';
import type { AccessContext } from '../src/domain/types';
const run = process.env.KAIA_DB_TEST === '1';
const a: AccessContext = {
  userId: `db-fixture-a-${randomUUID()}`,
  tenantId: 'local-test',
  objectId: 'a',
  displayName: 'Økonomikonsulent',
  title: 'Økonomikonsulent',
  roles: ['KAIA.Finance'],
  unitIds: ['school-hoeng'],
  areas: ['schools'],
};
const b = { ...a, userId: `db-fixture-b-${randomUUID()}`, objectId: 'b' };
let savedId = '',
  conversationId = '',
  session = '';
describe.skipIf(!run)('Reel lokal Postgres: sessions, ejerskab, scope og lake', () => {
  beforeAll(async () => {
    config({ path: '.env.local', quiet: true });
    vi.stubEnv('KAIA_TEST_MODE', '1');
    vi.stubEnv('VERCEL', '');
    for (const u of [a, b]) {
      await sql()`INSERT INTO kaia_users(id,tenant_id,object_id,roles,display_name,title) VALUES(${u.userId},${u.tenantId},${u.objectId},${sql().json(u.roles)},${u.displayName},${u.title})`;
      await sql()`INSERT INTO kaia_grants(user_id,unit_ids,areas) VALUES(${u.userId},${sql().json(u.unitIds)},${sql().json(u.areas)})`;
    }
  });
  afterAll(async () => {
    for (const u of [a, b]) {
      await sql()`DELETE FROM kaia_analyses WHERE owner_id=${u.userId}`;
      await sql()`DELETE FROM kaia_conversations WHERE owner_id=${u.userId}`;
      await sql()`DELETE FROM kaia_grants WHERE user_id=${u.userId}`;
      await sql()`DELETE FROM kaia_sessions WHERE user_id=${u.userId}`;
      await sql()`DELETE FROM kaia_users WHERE id=${u.userId}`;
    }
    await closeDb();
    vi.unstubAllEnvs();
  });
  it('indlæser kun faktisk tildelte DB-poster og ingen blandede dokumenter', async () => {
    const shell = await loadDatasetShell(a);
    const context = parseQuestion('Vis budgetstatus for Høng Skole', a, shell);
    const d = await loadDataset(a, context);
    expect(d.rows.length).toBeGreaterThan(1000);
    expect(
      d.rows.every(
        (r) =>
          r.entityId === 'school-hoeng' &&
          (r.year === 2026 || (r.year === 2023 && r.category === 'energy')),
      ),
    ).toBe(true);
    expect(d.documents.every((d) => d.entityIds.every((id) => id === 'school-hoeng'))).toBe(true);
    expect(d.demography).toHaveLength((d.coverage!.toYear - d.coverage!.fromYear + 1) * 4);
    const result = analyze('Vis budgetstatus for Høng Skole', a, undefined, context, d);
    const saved = await saveAnalysis(a, result);
    savedId = saved.analysisId;
    conversationId = saved.conversationId!;
    expect(savedId).toMatch(/^[0-9a-f-]{36}$/);
  });
  it('gemmer genåbningsbart snapshot i DB og afviser en anden ejer', async () => {
    expect((await ownedAnalysis(a, savedId)).analysisId).toBe(savedId);
    expect((await conversation(a, conversationId)).analyses).toHaveLength(1);
    await expect(ownedAnalysis(b, savedId)).rejects.toMatchObject({ status: 404 });
    await expect(conversation(b, conversationId)).rejects.toMatchObject({ status: 404 });
    await expect(
      saveAnalysis(b, await ownedAnalysis(a, savedId), conversationId),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('afviser tidligere snapshot efter scope er tilbagekaldt', async () => {
    await expect(ownedAnalysis({ ...a, unitIds: ['school-nyrup'] }, savedId)).rejects.toMatchObject(
      { status: 403 },
    );
    expect((await lists({ ...a, unitIds: ['school-nyrup'] })).conversations).toHaveLength(0);
  });
  it('henter opaque fixture-session fra rigtig DB og spærrer den i produktion', async () => {
    session = await createSession(a.userId, true);
    expect((await accessForToken(session))?.userId).toBe(a.userId);
    vi.stubEnv('VERCEL', '1');
    expect(await accessForToken(session)).toBeNull();
    vi.stubEnv('VERCEL', '');
    expect(await accessForToken('invalid')).toBeNull();
  });
  it('anvender aktuel scope-grant ved hvert sessionsopslag', async () => {
    await sql()`UPDATE kaia_grants SET unit_ids=${sql().json(['school-nyrup'])} WHERE user_id=${a.userId}`;
    expect((await accessForToken(session))?.unitIds).toEqual(['school-nyrup']);
    await sql()`UPDATE kaia_grants SET unit_ids=${sql().json(a.unitIds)} WHERE user_id=${a.userId}`;
  });
  it('holder rå og kurateret lake idempotent og atomisk i Postgres', async () => {
    const lake = postgresLake();
    const id = `lake-fixture-${randomUUID()}`,
      version = `fixture-${randomUUID()}`;
    const rawPayload = { synthetic: true };
    const rows = [
      { key: 'fixture1', entityId: 'school-hoeng', period: '2026-09', values: { amountOre: 1200 } },
    ];
    const snapshot: LakeSnapshot = {
      id,
      sourceId: 'demo-ledger',
      datasetVersion: version,
      observedAt: '2026-09-30T00:00:00Z',
      retrievedAt: '2026-10-20T00:00:00Z',
      schemaVersion: 'v1',
      contentHash: snapshotHash({ rawPayload, rows }),
      rawPayload,
      entityIds: ['school-hoeng'],
      rows,
    };
    try {
      expect(await lake.put(snapshot)).toBe('inserted');
      expect(await lake.put(snapshot)).toBe('unchanged');
      expect((await lake.get('demo-ledger', version, snapshot.observedAt))?.rows).toEqual(rows);
      expect(await lake.readRows('demo-ledger', version, ['school-nyrup'])).toEqual([]);
      expect(await lake.readRows('demo-ledger', version, ['school-hoeng'])).toEqual(rows);
      await expect(lake.put({ ...snapshot, contentHash: 'changed' })).rejects.toThrow();
      const [count] = await sql()`SELECT count(*) AS n FROM kaia_lake_snapshots WHERE id=${id}`;
      expect(Number(count.n)).toBe(1);
    } finally {
      await sql()`DELETE FROM kaia_lake_rows WHERE snapshot_id=${id}`;
      await sql()`DELETE FROM kaia_lake_snapshots WHERE id=${id}`;
    }
  });
  it('genskaber rå seeddele fra rigtig DB uden at ændre indhold eller checksum', async () => {
    const id = `lake-chunk-fixture-${randomUUID()}`,
      version = `fixture-${randomUUID()}`;
    const raw = {
      version,
      rows: Array.from({ length: 10_001 }, (_, id) => ({ id, amountOre: id * 13 })),
      documents: ['Simuleret notat'],
    };
    const observedAt = '2026-09-30T00:00:00Z';
    try {
      await sql().begin(async (tx) => {
        await tx`INSERT INTO kaia_lake_snapshots(id,source_id,dataset_version,observed_at,retrieved_at,schema_version,content_hash,raw_payload,entity_ids,row_count) VALUES(${id},'demo-ledger',${version},${observedAt},${observedAt},'kaia-generator-v2',${snapshotHash(raw)},${tx.json(rawRowManifest(raw) as never)},'[]',10001)`;
        for (const c of rawRowChunks(raw.rows))
          await tx`INSERT INTO kaia_lake_raw_chunks(snapshot_id,ordinal,payload,content_hash,row_count) VALUES(${id},${c.ordinal},${c.payload},${c.content_hash},${c.row_count})`;
      });
      const actual = await postgresLake().get('demo-ledger', version, observedAt);
      expect(actual?.rawPayload).toEqual(raw);
      expect(snapshotHash(actual?.rawPayload)).toBe(actual?.contentHash);
    } finally {
      await sql()`DELETE FROM kaia_lake_raw_chunks WHERE snapshot_id=${id}`;
      await sql()`DELETE FROM kaia_lake_snapshots WHERE id=${id}`;
    }
  });
  it('henter begge sammenligningsår fra DB og bevarer samme månedsdækning', async () => {
    const shell = await loadDatasetShell(a);
    const previous = parseQuestion('Vis budgetstatus for Høng Skole i 2026', a, shell);
    const question = 'Sammenlign op mod sidste års data';
    const context = parseQuestion(question, a, shell, previous);
    const dataset = await loadDataset(a, context);
    expect(context.intent).toBe('yearComparison');
    expect(dataset.rows.some((r) => r.year === 2025 && r.category === 'salary')).toBe(true);
    expect(dataset.rows.every((r) => r.entityId === 'school-hoeng')).toBe(true);
    const result = analyze(question, a, previous, undefined, dataset);
    expect(result.missingData).toBeFalsy();
    expect(result.chart?.rows).toHaveLength(2);
    expect(result.context.period).toEqual(previous.period);
  });
  it('henter autoriserede kommuneaggregater og afviser en enkelt skole som kommunebenchmark', async () => {
    const shell = await loadDatasetShell(a);
    const wide = {
      ...a,
      unitIds: shell.entities
        .filter((e) => e.area === 'schools' && e.type === 'school')
        .map((e) => e.id),
    };
    const question = 'Sammenlign skoleområdet med en sammenlignelig kommune';
    const context = parseQuestion(question, wide, shell);
    const dataset = await loadDataset(wide, context);
    expect(dataset.municipalities).toHaveLength(6);
    expect(
      dataset.municipalBenchmarks?.every((row) => row.area === 'schools' && row.year === 2026),
    ).toBe(true);
    const result = analyze(question, wide, undefined, undefined, dataset);
    expect(result.missingData).toBeFalsy();
    expect(result.context.metric).toBe('perPupil');
    expect(result.chart?.rows).toHaveLength(2);
    const narrowContext = { ...context, entityIds: a.unitIds };
    const restricted = await loadDataset(a, narrowContext);
    expect(restricted.municipalBenchmarks).toEqual([]);
    expect(analyze(question, a, undefined, narrowContext, restricted).missingData).toBeTruthy();
  });
  it('beregner flerårsprognose fra filtrerede DB-poster frem til det valgte slutår', async () => {
    const shell = await loadDatasetShell(a);
    const question = 'Vis prognosen for Høng Skole frem til 2032';
    const context = parseQuestion(question, a, shell);
    const dataset = await loadDataset(a, context);
    expect(dataset.rows.some((row) => row.year === 2032 && row.kind === 'forecast')).toBe(true);
    expect(dataset.rows.every((row) => row.entityId === 'school-hoeng')).toBe(true);
    const result = analyze(question, a, undefined, undefined, dataset);
    expect(result.missingData).toBeFalsy();
    expect(result.chart?.rows).toHaveLength(7);
    expect(result.context.projectionEndYear).toBe(2032);
  });
  it('gemmer illustrationens antagelser, beregning og graf med samme ejerskab og scope', async () => {
    const shell = await loadDatasetShell(a);
    const context = parseQuestion('Vis budgetstatus for Høng Skole', a, shell);
    const original = buildIllustration(
      'Illustrér et aktivitetsscenarie',
      a,
      context,
      {
        kind: 'activity',
        title: 'Aktivitetsillustration',
        years: 5,
        initialQuantityMilli: 24_000_000,
        annualChangeBps: 200,
        unit: 'besøg',
        assumptions: ['Et modeludkast til afprøvning; ingen registrerede aktiviteter.'],
      },
      shell,
    );
    const saved = await saveAnalysis(a, {
      ...original,
      renderedText: 'Et illustrativt forløb med angivne antagelser. [1]',
      formulation: { provider: 'corti', model: 'fixture-only' },
    });
    const reopened = await ownedAnalysis(a, saved.analysisId);
    expect(reopened.basisKind).toBe('illustration');
    expect(reopened.illustration).toEqual(original.illustration);
    expect(reopened.chart).toEqual(original.chart);
    expect(reopened.sources).toEqual(original.sources);
    expect(
      reopened.sources.every((source) => source.origin && !source.rowIds && !source.documentId),
    ).toBe(true);
    expect((await conversation(a, saved.conversationId!)).analyses[0]).toEqual(reopened);
    await expect(ownedAnalysis(b, saved.analysisId)).rejects.toMatchObject({ status: 404 });
    await expect(
      ownedAnalysis({ ...a, unitIds: ['school-nyrup'] }, saved.analysisId),
    ).rejects.toMatchObject({ status: 403 });
  });
});
