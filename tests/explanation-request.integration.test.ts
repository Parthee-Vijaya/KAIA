import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { AccessContext, Analysis, Entity } from '../src/domain/types';
import {
  analysisRequestStatus,
  beginAnalysisRequest,
  beginExplanationRequest,
  cancelAnalysisRequest,
  completeExplanationRequest,
  watchAnalysisRequest,
} from '../src/server/analysis-requests';
import { closeDb, sql } from '../src/server/db';
import { saveAnalysis } from '../src/server/repository';

const run = process.env.KAIA_DB_TEST === '1';
const fixtureId = randomUUID();
const version = `KAIA-EXPLANATION-FIXTURE-${fixtureId}`;
const owners: AccessContext[] = [0, 1].map((index) => ({
  userId: `explanation-fixture-${fixtureId}-${index}`,
  tenantId: `explanation-fixture-${fixtureId}`,
  objectId: String(index),
  displayName: 'Økonomikonsulent',
  title: 'Økonomikonsulent',
  roles: ['KAIA.Finance'],
  unitIds: [index === 0 ? 'school-hoeng' : 'school-sveboelle'],
  areas: ['schools'],
}));
const [owner, otherOwner] = owners;
const entities: Entity[] = owners.map((user, index) => ({
  id: user.unitIds[0],
  name: index === 0 ? 'Høng Skole' : 'Svebølle Skole',
  aliases: [],
  type: 'school',
  area: 'schools',
  nameSourceUrl: 'https://www.kalundborg.dk/',
  verifiedAt: '2026-10-21',
  synthetic: { pupils: 100, annualBudgetOre: 100000 },
}));
const analysisFor = (user = owner): Analysis => ({
  analysisId: `DEMO-EXPLANATION-FIXTURE-${fixtureId}`,
  datasetVersion: version,
  question: 'Vis budgetstatus.',
  title: 'Budgetstatus',
  conclusion: 'Afgrænset testgrundlag.',
  narrative: [],
  metrics: [],
  sources: [],
  assumptions: [],
  followups: [],
  context: {
    area: 'schools',
    entityIds: [...user.unitIds],
    period: { year: 2026, fromMonth: 1, toMonth: 9 },
    intent: 'budget',
    metric: 'net',
  },
});
async function artifacts(user = owner) {
  const [counts] = await sql()`SELECT
    (SELECT count(*) FROM kaia_analyses WHERE owner_id=${user.userId}) AS analyses,
    (SELECT count(*) FROM kaia_conversations WHERE owner_id=${user.userId}) AS conversations`;
  return { analyses: Number(counts.analyses), conversations: Number(counts.conversations) };
}
let authorizedDatabase = false;
async function clearOwnArtifacts() {
  if (!authorizedDatabase) return;
  for (const user of owners) {
    await sql()`DELETE FROM kaia_analysis_requests WHERE owner_id=${user.userId}`;
    await sql()`DELETE FROM kaia_analyses WHERE owner_id=${user.userId}`;
    await sql()`DELETE FROM kaia_conversations WHERE owner_id=${user.userId}`;
  }
}

describe.skipIf(!run)(
  'Reel lokal Postgres: flygtige forklaringsopgaver, stop og atomiske tilstande',
  () => {
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
        /* Never expose a connection string. */
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
      VALUES(${version},${fixtureId},'2026-09-30',0,0,${sql().json({ fromYear: 2026, toYear: 2026 })})`;
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

    it('afslutter en forklaring uden analyse-ID, snapshot eller ny samtale', async () => {
      const id = randomUUID();
      expect(await beginExplanationRequest(owner, id)).toEqual({
        requestId: id,
        status: 'running',
      });
      expect(await completeExplanationRequest(owner, id)).toEqual({
        requestId: id,
        status: 'completed',
      });
      expect(await analysisRequestStatus(owner, id)).toEqual({
        requestId: id,
        status: 'completed',
      });
      const [row] =
        await sql()`SELECT job_kind,state,analysis_id FROM kaia_analysis_requests WHERE request_id=${id}`;
      expect(row).toMatchObject({ job_kind: 'explanation', state: 'completed', analysis_id: null });
      expect(await artifacts()).toEqual({ analyses: 0, conversations: 0 });
    });

    it('gør hverken tidlig eller gentagen Stop til en ny analyse eller en reaktivering', async () => {
      const id = randomUUID();
      expect(await cancelAnalysisRequest(owner, id)).toMatchObject({ status: 'cancelled' });
      await expect(beginExplanationRequest(owner, id)).rejects.toMatchObject({
        status: 409,
        code: 'ANALYSIS_CANCELLED',
      });
      await expect(completeExplanationRequest(owner, id)).rejects.toMatchObject({
        status: 409,
        code: 'ANALYSIS_CANCELLED',
      });
      expect(await cancelAnalysisRequest(owner, id)).toMatchObject({ status: 'cancelled' });
      expect(await artifacts()).toEqual({ analyses: 0, conversations: 0 });
    });

    it('bevarer en afsluttet forklaring som completed ved forsinket Stop', async () => {
      const id = randomUUID();
      await beginExplanationRequest(owner, id);
      await completeExplanationRequest(owner, id);
      expect(await cancelAnalysisRequest(owner, id)).toEqual({
        requestId: id,
        status: 'completed',
      });
      await expect(completeExplanationRequest(owner, id)).rejects.toMatchObject({ status: 409 });
      await expect(beginExplanationRequest(owner, id)).rejects.toMatchObject({ status: 409 });
      expect(await artifacts()).toEqual({ analyses: 0, conversations: 0 });
    });

    it('binder running/completed/cancelled til ejer uden at afsløre fremmede request-IDer', async () => {
      for (const state of ['running', 'completed', 'cancelled']) {
        const id = randomUUID();
        await beginExplanationRequest(owner, id);
        if (state === 'completed') await completeExplanationRequest(owner, id);
        if (state === 'cancelled') await cancelAnalysisRequest(owner, id);
        expect(await analysisRequestStatus(otherOwner, id)).toBeUndefined();
        expect(await analysisRequestStatus(otherOwner, randomUUID())).toBeUndefined();
        await expect(beginExplanationRequest(otherOwner, id)).rejects.toMatchObject({
          status: 404,
        });
        await expect(completeExplanationRequest(otherOwner, id)).rejects.toMatchObject({
          status: 404,
        });
        await expect(cancelAnalysisRequest(otherOwner, id)).rejects.toMatchObject({ status: 404 });
        expect(await analysisRequestStatus(owner, id)).toMatchObject({ status: state });
      }
      expect(await artifacts(otherOwner)).toEqual({ analyses: 0, conversations: 0 });
    });

    it('afviser completion uden begin og ugyldige UUIDer før databaseændringer', async () => {
      await expect(completeExplanationRequest(owner, randomUUID())).rejects.toMatchObject({
        status: 409,
      });
      for (const operation of [beginExplanationRequest, completeExplanationRequest])
        await expect(operation(owner, 'not-a-uuid')).rejects.toMatchObject({ status: 400 });
      const [count] =
        await sql()`SELECT count(*) FROM kaia_analysis_requests WHERE owner_id=${owner.userId}`;
      expect(Number(count.count)).toBe(0);
    });

    it('kan ikke bruge en analyseopgave til flygtig forklaringscompletion', async () => {
      const id = randomUUID();
      await beginAnalysisRequest(owner, id);
      await expect(completeExplanationRequest(owner, id)).rejects.toMatchObject({ status: 409 });
      await expect(beginExplanationRequest(owner, id)).rejects.toMatchObject({ status: 409 });
      expect(await analysisRequestStatus(owner, id)).toEqual({ requestId: id, status: 'running' });
      expect(await artifacts()).toEqual({ analyses: 0, conversations: 0 });
    });

    it('kan ikke gemme et snapshot eller en tom samtale gennem en forklaringsopgave', async () => {
      const id = randomUUID();
      await beginExplanationRequest(owner, id);
      await expect(beginAnalysisRequest(owner, id)).rejects.toMatchObject({ status: 409 });
      await expect(saveAnalysis(owner, analysisFor(), undefined, id)).rejects.toMatchObject({
        status: 409,
      });
      expect(await analysisRequestStatus(owner, id)).toMatchObject({ status: 'running' });
      await completeExplanationRequest(owner, id);
      await expect(saveAnalysis(owner, analysisFor(), undefined, id)).rejects.toMatchObject({
        status: 409,
      });
      expect(await artifacts()).toEqual({ analyses: 0, conversations: 0 });
    });

    it('bevarer eksisterende normal analyselagring med præcis ét snapshot og analyse-ID', async () => {
      const id = randomUUID();
      await beginAnalysisRequest(owner, id);
      const saved = await saveAnalysis(owner, analysisFor(), undefined, id);
      expect(await analysisRequestStatus(owner, id)).toEqual({
        requestId: id,
        status: 'completed',
        analysisId: saved.analysisId,
        conversationId: saved.conversationId,
      });
      await expect(completeExplanationRequest(owner, id)).rejects.toMatchObject({ status: 409 });
      expect(await artifacts()).toEqual({ analyses: 1, conversations: 1 });
    });

    it('databasen tillader ikke completed analysis/null eller completed explanation/analysis-ID', async () => {
      const analysisId = randomUUID(),
        explanationId = randomUUID();
      await beginAnalysisRequest(owner, analysisId);
      await beginExplanationRequest(owner, explanationId);
      await expect(
        sql()`UPDATE kaia_analysis_requests SET state='completed',analysis_id=NULL WHERE request_id=${analysisId}`,
      ).rejects.toMatchObject({ code: '23514' });
      const saved = await saveAnalysis(owner, analysisFor());
      await expect(
        sql()`UPDATE kaia_analysis_requests SET state='completed',analysis_id=${saved.analysisId} WHERE request_id=${explanationId}`,
      ).rejects.toMatchObject({ code: '23514' });
      expect(await analysisRequestStatus(owner, analysisId)).toMatchObject({ status: 'running' });
      expect(await analysisRequestStatus(owner, explanationId)).toMatchObject({
        status: 'running',
      });
    });

    it('lineariserer samtidig Stop og completion uden et falsk cancelled efter completed', async () => {
      for (let iteration = 0; iteration < 12; iteration++) {
        const id = randomUUID();
        await beginExplanationRequest(owner, id);
        const [completion, cancellation] = await Promise.allSettled([
          completeExplanationRequest(owner, id),
          cancelAnalysisRequest(owner, id),
        ]);
        expect(cancellation.status).toBe('fulfilled');
        const final = await analysisRequestStatus(owner, id);
        if (completion.status === 'fulfilled') {
          expect(completion.value).toEqual({ requestId: id, status: 'completed' });
          expect(final).toEqual({ requestId: id, status: 'completed' });
          if (cancellation.status === 'fulfilled')
            expect(cancellation.value.status).toBe('completed');
        } else {
          expect(completion.reason).toMatchObject({ status: 409, code: 'ANALYSIS_CANCELLED' });
          expect(final).toEqual({ requestId: id, status: 'cancelled' });
        }
      }
      expect(await artifacts()).toEqual({ analyses: 0, conversations: 0 });
    });

    it('lader højst ét samtidigt begin og én completion vinde uden en ekstra opgave', async () => {
      const id = randomUUID();
      const begun = await Promise.allSettled([
        beginExplanationRequest(owner, id),
        beginExplanationRequest(owner, id),
      ]);
      expect(begun.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(begun.find((result) => result.status === 'rejected')).toMatchObject({
        reason: { status: 409 },
      });
      const finished = await Promise.allSettled([
        completeExplanationRequest(owner, id),
        completeExplanationRequest(owner, id),
      ]);
      expect(finished.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(finished.find((result) => result.status === 'rejected')).toMatchObject({
        reason: { status: 409 },
      });
      const [count] =
        await sql()`SELECT count(*) FROM kaia_analysis_requests WHERE owner_id=${owner.userId}`;
      expect(Number(count.count)).toBe(1);
      expect(await artifacts()).toEqual({ analyses: 0, conversations: 0 });
    });

    it('kan stoppe en kørende providerwatch gennem den fælles persistente annullering', async () => {
      const id = randomUUID();
      await beginExplanationRequest(owner, id);
      const controller = new AbortController();
      const stop = watchAnalysisRequest(owner, id, controller);
      try {
        const aborted = new Promise<void>((resolve, reject) => {
          const deadline = setTimeout(
            () => reject(new Error('Watch stoppede ikke forklaringen.')),
            3000,
          );
          controller.signal.addEventListener(
            'abort',
            () => {
              clearTimeout(deadline);
              resolve();
            },
            { once: true },
          );
        });
        await cancelAnalysisRequest(owner, id);
        await aborted;
        expect(controller.signal.aborted).toBe(true);
        await expect(completeExplanationRequest(owner, id)).rejects.toMatchObject({
          code: 'ANALYSIS_CANCELLED',
        });
      } finally {
        stop();
      }
      expect(await artifacts()).toEqual({ analyses: 0, conversations: 0 });
    });
  },
);
