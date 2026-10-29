import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { analyze } from '../src/domain/analysis';
import { CATEGORIES, type Dataset } from '../src/domain/data';
import type { AccessContext, Entity, LedgerRow } from '../src/domain/types';
import {
  analysisRequestStatus,
  beginAnalysisRequest,
  cancelAnalysisRequest,
} from '../src/server/analysis-requests';
import { closeDb, sql } from '../src/server/db';
import { conversation, ownedAnalysis, saveAnalysis } from '../src/server/repository';

const run = process.env.KAIA_DB_TEST === '1';
const fixtureId = randomUUID();
const version = `KAIA-CANCEL-FIXTURE-${fixtureId}`;
const owners: AccessContext[] = ['school-hoeng', 'school-nyrup'].map((unitId, index) => ({
  userId: `cancel-fixture-${fixtureId}-${index}`,
  tenantId: `cancel-fixture-${fixtureId}`,
  objectId: String(index),
  displayName: 'Økonomikonsulent',
  title: 'Økonomikonsulent',
  roles: ['KAIA.Finance'],
  unitIds: [unitId],
  areas: ['schools'],
}));
const [owner, otherOwner] = owners;
const entities: Entity[] = ['Høng Skole', 'Nyrupskolen'].map((name, index) => ({
  id: owners[index].unitIds[0],
  name,
  aliases: [],
  type: 'school',
  area: 'schools',
  nameSourceUrl: 'https://www.kalundborg.dk/',
  verifiedAt: '2026-10-21',
  synthetic: { pupils: 100 + index, annualBudgetOre: 1_000_000 },
}));
const rows: LedgerRow[] = entities.flatMap((entity, index) =>
  Array.from({ length: 12 }, (_, monthIndex) =>
    CATEGORIES.flatMap((category, categoryIndex) =>
      (['budget', 'actual', 'forecast'] as const)
        .filter((kind) => kind !== 'actual' || monthIndex < 9)
        .map((kind) => ({
          id: `${entity.id}-2026-${monthIndex + 1}-${category}-${kind}`,
          datasetVersion: version,
          entityId: entity.id,
          year: 2026,
          month: monthIndex + 1,
          category,
          kind,
          amountOre:
            (category === 'income' ? -1 : 1) *
            (10_000 * (index + 1) + categoryIndex * 17 + (kind === 'budget' ? 0 : 103)),
        })),
    ),
  ).flat(),
);
const dataset: Dataset = {
  version,
  seed: fixtureId,
  referenceDate: '2026-09-30',
  coverage: { fromYear: 2026, toYear: 2026 },
  entities,
  rows,
  documents: [],
  demography: [],
};
function analysisFor(user: AccessContext = owner) {
  return analyze(
    `Giv mig budgetstatus for ${entities.find((entity) => entity.id === user.unitIds[0])!.name}`,
    user,
    undefined,
    {
      area: 'schools',
      entityIds: user.unitIds,
      period: { year: 2026, fromMonth: 1, toMonth: 9 },
      metric: 'net',
      intent: 'budget',
    },
    dataset,
  );
}

async function artifactCounts(user = owner) {
  const [counts] = await sql()`
    SELECT
      (SELECT count(*) FROM kaia_analyses WHERE owner_id=${user.userId}) AS analyses,
      (SELECT count(*) FROM kaia_conversations WHERE owner_id=${user.userId}) AS conversations
  `;
  return { analyses: Number(counts.analyses), conversations: Number(counts.conversations) };
}

let authorizedDatabase = false;
async function clearOwnArtifacts() {
  if (!authorizedDatabase) return;
  for (const user of owners) {
    // Only this run's opaque owners are touched; never truncate shared test tables.
    await sql()`DELETE FROM kaia_analysis_requests WHERE owner_id=${user.userId}`;
    await sql()`DELETE FROM kaia_analyses WHERE owner_id=${user.userId}`;
    await sql()`DELETE FROM kaia_conversations WHERE owner_id=${user.userId}`;
  }
}

describe.skipIf(!run)('Reel lokal Postgres: stop, ejerskab og atomisk analyselagring', () => {
  beforeAll(async () => {
    config({ path: '.env.local', quiet: true });
    let localTestDatabase = false;
    try {
      const url = new URL(process.env.DATABASE_URL || '');
      localTestDatabase =
        ['postgres:', 'postgresql:'].includes(url.protocol) &&
        ['127.0.0.1', 'localhost'].includes(url.hostname) &&
        url.port === '55432';
    } catch {
      // Do not expose the configured connection string in a failed test.
    }
    if (!localTestDatabase)
      throw new Error('Prøven kræver den eksplicitte lokale testdatabase på port 55432.');
    authorizedDatabase = true;
    for (const user of owners) {
      await sql()`INSERT INTO kaia_users(id,tenant_id,object_id,roles,display_name,title)
        VALUES(${user.userId},${user.tenantId},${user.objectId},${sql().json(user.roles)},${user.displayName},${user.title})`;
      await sql()`INSERT INTO kaia_grants(user_id,unit_ids,areas)
        VALUES(${user.userId},${sql().json(user.unitIds)},${sql().json(user.areas)})`;
    }
    await sql()`INSERT INTO kaia_datasets(version,seed,reference_date,row_count,document_count,coverage)
      VALUES(${version},${fixtureId},${dataset.referenceDate},${rows.length},0,${sql().json(dataset.coverage!)})`;
    for (const entity of entities)
      await sql()`INSERT INTO kaia_entities(dataset_version,id,area,data)
        VALUES(${version},${entity.id},${entity.area},${sql().json(entity as never)})`;
  });

  afterEach(clearOwnArtifacts);

  afterAll(async () => {
    try {
      await clearOwnArtifacts();
      if (authorizedDatabase) {
        for (const user of owners) {
          await sql()`DELETE FROM kaia_sessions WHERE user_id=${user.userId}`;
          await sql()`DELETE FROM kaia_grants WHERE user_id=${user.userId}`;
          await sql()`DELETE FROM kaia_users WHERE id=${user.userId}`;
        }
        await sql()`DELETE FROM kaia_entities WHERE dataset_version=${version}`;
        await sql()`DELETE FROM kaia_datasets WHERE version=${version}`;
      }
    } finally {
      await closeDb();
    }
  });

  it('afviser parallel registrering af samme igangværende request uden ekstra lagring', async () => {
    const requestId = randomUUID();
    await beginAnalysisRequest(owner, requestId);
    expect(await analysisRequestStatus(owner, requestId)).toMatchObject({
      requestId,
      status: 'running',
    });
    await expect(beginAnalysisRequest(owner, requestId)).rejects.toMatchObject({ status: 409 });
    expect(await artifactCounts()).toEqual({ analyses: 0, conversations: 0 });
  });

  it('bevarer et tidligt stop som tombstone før analyseforespørgslen når backend', async () => {
    const requestId = randomUUID();
    expect(await cancelAnalysisRequest(owner, requestId)).toMatchObject({
      requestId,
      status: 'cancelled',
    });
    await expect(beginAnalysisRequest(owner, requestId)).rejects.toMatchObject({
      status: 409,
      code: 'ANALYSIS_CANCELLED',
    });
    await expect(saveAnalysis(owner, analysisFor(), undefined, requestId)).rejects.toMatchObject({
      status: 409,
      code: 'ANALYSIS_CANCELLED',
    });
    expect(await cancelAnalysisRequest(owner, requestId)).toMatchObject({ status: 'cancelled' });
    expect(await artifactCounts()).toEqual({ analyses: 0, conversations: 0 });
  });

  it('stopper en registreret forespørgsel før persist uden en tom samtale eller et snapshot', async () => {
    const requestId = randomUUID();
    await beginAnalysisRequest(owner, requestId);
    const result = analysisFor();
    await cancelAnalysisRequest(owner, requestId);
    await expect(saveAnalysis(owner, result, undefined, requestId)).rejects.toMatchObject({
      status: 409,
      code: 'ANALYSIS_CANCELLED',
    });
    expect(await artifactCounts()).toEqual({ analyses: 0, conversations: 0 });
    expect(await analysisRequestStatus(owner, requestId)).toMatchObject({ status: 'cancelled' });
  });

  it('lader en eksisterende samtale være helt uændret ved stop af en opfølgning', async () => {
    const first = await saveAnalysis(owner, analysisFor());
    const before = await conversation(owner, first.conversationId!);
    const requestId = randomUUID();
    await beginAnalysisRequest(owner, requestId);
    await cancelAnalysisRequest(owner, requestId);
    await expect(
      saveAnalysis(owner, analysisFor(), first.conversationId, requestId),
    ).rejects.toMatchObject({ code: 'ANALYSIS_CANCELLED' });
    const after = await conversation(owner, first.conversationId!);
    expect(after).toEqual(before);
    expect(await artifactCounts()).toEqual({ analyses: 1, conversations: 1 });
  });

  it('binder requestId til ejeren uden at afsløre eller ændre en anden ejers status', async () => {
    const requestId = randomUUID();
    await beginAnalysisRequest(owner, requestId);
    expect(await analysisRequestStatus(otherOwner, requestId)).toBeUndefined();
    expect(await analysisRequestStatus(otherOwner, randomUUID())).toBeUndefined();
    await expect(beginAnalysisRequest(otherOwner, requestId)).rejects.toMatchObject({
      status: 404,
    });
    await expect(cancelAnalysisRequest(otherOwner, requestId)).rejects.toMatchObject({
      status: 404,
    });
    // The intruder's analysis is within their own unit scope. Only request ownership denies this save.
    await expect(
      saveAnalysis(otherOwner, analysisFor(otherOwner), undefined, requestId),
    ).rejects.toMatchObject({ status: 404 });
    expect(await analysisRequestStatus(owner, requestId)).toMatchObject({ status: 'running' });
    expect(await artifactCounts(owner)).toEqual({ analyses: 0, conversations: 0 });
    expect(await artifactCounts(otherOwner)).toEqual({ analyses: 0, conversations: 0 });
  });

  it('kan ikke tage ejerskab over et allerede annulleret requestId', async () => {
    const requestId = randomUUID();
    await cancelAnalysisRequest(owner, requestId);
    await expect(beginAnalysisRequest(otherOwner, requestId)).rejects.toMatchObject({
      status: 404,
    });
    await expect(cancelAnalysisRequest(otherOwner, requestId)).rejects.toMatchObject({
      status: 404,
    });
    expect(await analysisRequestStatus(owner, requestId)).toMatchObject({ status: 'cancelled' });
    expect(await analysisRequestStatus(otherOwner, requestId)).toBeUndefined();
    expect(await artifactCounts(otherOwner)).toEqual({ analyses: 0, conversations: 0 });
  });

  it('giver ikke et requestId adgang til data uden for brugerens tildelte enhed', async () => {
    const requestId = randomUUID();
    await beginAnalysisRequest(owner, requestId);
    await expect(
      saveAnalysis(owner, analysisFor(otherOwner), undefined, requestId),
    ).rejects.toMatchObject({ status: 403 });
    expect(await artifactCounts()).toEqual({ analyses: 0, conversations: 0 });
    expect(await analysisRequestStatus(owner, requestId)).toMatchObject({ status: 'running' });
  });

  it('rapporterer completed efter commit og fjerner ikke et allerede gemt resultat', async () => {
    const requestId = randomUUID();
    await beginAnalysisRequest(owner, requestId);
    const saved = await saveAnalysis(owner, analysisFor(), undefined, requestId);
    const completed = {
      requestId,
      status: 'completed',
      analysisId: saved.analysisId,
      conversationId: saved.conversationId,
    };
    expect(await analysisRequestStatus(owner, requestId)).toMatchObject(completed);
    expect(await cancelAnalysisRequest(owner, requestId)).toMatchObject(completed);
    expect(await cancelAnalysisRequest(owner, requestId)).toMatchObject(completed);
    expect(await analysisRequestStatus(otherOwner, requestId)).toBeUndefined();
    await expect(cancelAnalysisRequest(otherOwner, requestId)).rejects.toMatchObject({
      status: 404,
    });
    expect(await ownedAnalysis(owner, saved.analysisId)).toEqual(saved);
    expect(await artifactCounts()).toEqual({ analyses: 1, conversations: 1 });
  });

  it('opretter højst ét snapshot og én samtale ved gentagen lagring med samme requestId', async () => {
    const requestId = randomUUID();
    await beginAnalysisRequest(owner, requestId);
    const saved = await saveAnalysis(owner, analysisFor(), undefined, requestId);
    await expect(beginAnalysisRequest(owner, requestId)).rejects.toMatchObject({ status: 409 });
    await expect(saveAnalysis(owner, analysisFor(), undefined, requestId)).rejects.toMatchObject({
      status: 409,
    });
    expect(await analysisRequestStatus(owner, requestId)).toMatchObject({
      status: 'completed',
      analysisId: saved.analysisId,
      conversationId: saved.conversationId,
    });
    expect(await artifactCounts()).toEqual({ analyses: 1, conversations: 1 });
  });

  it('fejler lukket hvis et requestId aldrig er registreret', async () => {
    const requestId = randomUUID();
    await expect(saveAnalysis(owner, analysisFor(), undefined, requestId)).rejects.toMatchObject({
      status: 409,
    });
    expect(await analysisRequestStatus(owner, requestId)).toBeUndefined();
    expect(await artifactCounts()).toEqual({ analyses: 0, conversations: 0 });
  });

  it('ruller både ny samtale og jobstatus tilbage hvis snapshotlagringen fejler', async () => {
    const requestId = randomUUID();
    await beginAnalysisRequest(owner, requestId);
    const invalidSnapshot = analysisFor();
    // A non-JSON value makes the snapshot insert fail after the conversation insert.
    // This probes the real transaction without altering shared database constraints.
    invalidSnapshot.metrics[0].value = 1n as unknown as number;
    await expect(saveAnalysis(owner, invalidSnapshot, undefined, requestId)).rejects.toThrow();
    expect(await artifactCounts()).toEqual({ analyses: 0, conversations: 0 });
    expect(await analysisRequestStatus(owner, requestId)).toMatchObject({ status: 'running' });
    await cancelAnalysisRequest(owner, requestId);
    expect(await analysisRequestStatus(owner, requestId)).toMatchObject({ status: 'cancelled' });
  });

  it('serialiserer to samtidige saves med samme requestId til ét snapshot', async () => {
    const requestId = randomUUID();
    await beginAnalysisRequest(owner, requestId);
    const result = analysisFor();
    const outcomes = await Promise.allSettled([
      saveAnalysis(owner, result, undefined, requestId),
      saveAnalysis(owner, result, undefined, requestId),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
    if (rejected?.status === 'rejected') expect(rejected.reason).toMatchObject({ status: 409 });
    const fulfilled = outcomes.find((outcome) => outcome.status === 'fulfilled');
    if (fulfilled?.status === 'fulfilled')
      expect(await analysisRequestStatus(owner, requestId)).toMatchObject({
        status: 'completed',
        analysisId: fulfilled.value.analysisId,
        conversationId: fulfilled.value.conversationId,
      });
    expect(await artifactCounts()).toEqual({ analyses: 1, conversations: 1 });
  });

  it('afviser en fremmed samtale og markerer ikke et mislykket save som completed', async () => {
    const foreign = await saveAnalysis(otherOwner, analysisFor(otherOwner));
    const requestId = randomUUID();
    await beginAnalysisRequest(owner, requestId);
    await expect(
      saveAnalysis(owner, analysisFor(), foreign.conversationId, requestId),
    ).rejects.toMatchObject({ status: 404 });
    expect(await analysisRequestStatus(owner, requestId)).toMatchObject({ status: 'running' });
    expect(await artifactCounts(owner)).toEqual({ analyses: 0, conversations: 0 });
    expect(await artifactCounts(otherOwner)).toEqual({ analyses: 1, conversations: 1 });
  });

  it('lineariserer samtidige stop og save uden annulleret status med gemte artefakter', async () => {
    let committed = 0;
    for (let iteration = 0; iteration < 12; iteration++) {
      const requestId = randomUUID();
      await beginAnalysisRequest(owner, requestId);
      const result = analysisFor();
      const save = () => saveAnalysis(owner, result, undefined, requestId);
      const cancel = () => cancelAnalysisRequest(owner, requestId);
      const outcomes =
        iteration % 2 === 0
          ? await Promise.allSettled([save(), cancel()])
          : (await Promise.allSettled([cancel(), save()])).reverse();
      const [saved, cancelled] = outcomes;
      expect(cancelled.status).toBe('fulfilled');
      const status = await analysisRequestStatus(owner, requestId);
      if (status?.status === 'cancelled') {
        expect(saved.status).toBe('rejected');
        if (saved.status === 'rejected')
          expect(saved.reason).toMatchObject({ status: 409, code: 'ANALYSIS_CANCELLED' });
        if (cancelled.status === 'fulfilled')
          expect(cancelled.value).toMatchObject({ requestId, status: 'cancelled' });
      } else {
        expect(status?.status).toBe('completed');
        expect(saved.status).toBe('fulfilled');
        if (saved.status === 'fulfilled' && 'analysisId' in saved.value) {
          committed++;
          expect(status).toMatchObject({
            analysisId: saved.value.analysisId,
            conversationId: saved.value.conversationId,
          });
          if (cancelled.status === 'fulfilled')
            expect(cancelled.value).toMatchObject({ requestId, status: 'completed' });
          expect(await ownedAnalysis(owner, saved.value.analysisId!)).toEqual(saved.value);
        }
      }
      expect(await artifactCounts()).toEqual({ analyses: committed, conversations: committed });
      expect(await artifactCounts(otherOwner)).toEqual({ analyses: 0, conversations: 0 });
    }
  });
});
