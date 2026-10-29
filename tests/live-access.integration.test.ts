import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessContext } from '../src/domain/types';
import type { ProviderConnection } from '../src/server/providers';
import { closeDb, sql } from '../src/server/db';
import {
  analysisRequestStatus,
  beginAnalysisRequest,
  cancelAnalysisRequest,
} from '../src/server/analysis-requests';
import {
  acquireLiveAnalysis,
  grantLiveAccessForOwner,
  providersForUser,
  revokeLiveAccessForOwner,
  selectedProviderFor,
} from '../src/server/live-access';

const mocks = vi.hoisted(() => ({
  getProvider: vi.fn(),
  activeProvider: vi.fn(),
  publicProviders: vi.fn(),
}));
vi.mock('@/server/providers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/server/providers')>();
  // Keep pure configured/fingerprint contracts; no real provider lookup, credentials or model calls.
  return {
    ...actual,
    getProvider: mocks.getProvider,
    activeProvider: mocks.activeProvider,
    publicProviders: mocks.publicProviders,
  };
});

const run = process.env.KAIA_DB_TEST === '1';
const owners: AccessContext[] = Array.from({ length: 3 }, (_, index) => {
  const id = randomUUID();
  return {
    userId: `demo:${id}`,
    objectId: id,
    tenantId: index === 2 ? 'live-fixture-private-tenant' : 'kaia-demo',
    displayName: 'Økonomikonsulent',
    title: 'Økonomikonsulent',
    roles: ['KAIA.Finance'],
    areas: ['schools'],
    unitIds: ['school-hoeng'],
  };
});
const [owner, otherOwner, wrongTenant] = owners;
const live: ProviderConnection = {
  id: 'corti',
  model: 'fixture-model-no-network',
  tested: true,
  endpoint: 'https://ai.eu.corti.app/v1',
  region: 'eu',
  secrets: { apiKey: 'fixture-not-a-real-credential' },
};
const demo: ProviderConnection = {
  id: 'demo',
  model: 'Deterministisk analyse',
  tested: true,
  secrets: {},
};
let authorizedDatabase = false;
async function grant(user = owner, dailyLimit = 2) {
  return grantLiveAccessForOwner(user.userId, { providerId: 'corti', dailyLimit });
}
async function storedGrant(user = owner) {
  const [row] =
    await sql()`SELECT data FROM kaia_configuration WHERE key=${`live-grant:${user.userId}`}`;
  return row?.data as
    | {
        ownerId: string;
        revokedAt?: string;
        lease?: { token: string; expiresAt: string };
        [key: string]: unknown;
      }
    | undefined;
}
async function usage(user = owner) {
  const rows =
    await sql()`SELECT count,window_start FROM kaia_usage WHERE user_id=${`live:${user.userId}`} ORDER BY window_start`;
  return rows.map((row) => ({ count: Number(row.count), window: new Date(row.window_start) }));
}
async function clearOwnFixtures() {
  if (!authorizedDatabase) return;
  for (const user of owners) {
    await sql()`DELETE FROM kaia_analysis_requests WHERE owner_id=${user.userId}`;
    await sql()`DELETE FROM kaia_analyses WHERE owner_id=${user.userId}`;
    await sql()`DELETE FROM kaia_conversations WHERE owner_id=${user.userId}`;
    await sql()`DELETE FROM kaia_configuration WHERE key=${`live-grant:${user.userId}`}`;
    await sql()`DELETE FROM kaia_usage WHERE user_id=${`live:${user.userId}`}`;
  }
}

describe.skipIf(!run)('Reel lokal Postgres: privat live-adgang, lease og døgnkvote', () => {
  beforeAll(async () => {
    config({ path: '.env.local', quiet: true });
    let local = false;
    try {
      const url = new URL(process.env.DATABASE_URL || '');
      local =
        ['postgres:', 'postgresql:'].includes(url.protocol) &&
        ['localhost', '127.0.0.1'].includes(url.hostname) &&
        url.port === '55432';
    } catch {
      /* Never print a configured database URL. */
    }
    if (!local) throw new Error('Prøven kræver den eksplicitte lokale testdatabase på port 55432.');
    authorizedDatabase = true;
    for (const user of owners) {
      await sql()`INSERT INTO kaia_users(id,tenant_id,object_id,roles,display_name,title)
        VALUES(${user.userId},${user.tenantId},${user.objectId},${sql().json(user.roles)},${user.displayName},${user.title})`;
      await sql()`INSERT INTO kaia_grants(user_id,unit_ids,areas)
        VALUES(${user.userId},${sql().json(user.unitIds)},${sql().json(user.areas)})`;
    }
  });
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getProvider.mockImplementation(async (id: string) => (id === 'demo' ? demo : live));
    mocks.activeProvider.mockResolvedValue(live);
    mocks.publicProviders.mockResolvedValue([]);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('Live access integration tests cannot call a network provider.');
      }),
    );
  });
  afterEach(async () => {
    await clearOwnFixtures();
    vi.unstubAllGlobals();
  });
  afterAll(async () => {
    try {
      await clearOwnFixtures();
      if (authorizedDatabase)
        for (const user of owners) {
          await sql()`DELETE FROM kaia_sessions WHERE user_id=${user.userId}`;
          await sql()`DELETE FROM kaia_grants WHERE user_id=${user.userId}`;
          await sql()`DELETE FROM kaia_users WHERE id=${user.userId}`;
        }
      if (authorizedDatabase) {
        const ids = owners.map((user) => user.userId);
        const grants = ids.map((id) => `live-grant:${id}`);
        const counters = ids.map((id) => `live:${id}`);
        const [remaining] = await sql()`SELECT
          (SELECT count(*)::integer FROM kaia_users WHERE id IN ${sql()(ids)}) AS users,
          (SELECT count(*)::integer FROM kaia_analysis_requests WHERE owner_id IN ${sql()(ids)}) AS requests,
          (SELECT count(*)::integer FROM kaia_analyses WHERE owner_id IN ${sql()(ids)}) AS analyses,
          (SELECT count(*)::integer FROM kaia_conversations WHERE owner_id IN ${sql()(ids)}) AS conversations,
          (SELECT count(*)::integer FROM kaia_configuration WHERE key IN ${sql()(grants)}) AS grants,
          (SELECT count(*)::integer FROM kaia_usage WHERE user_id IN ${sql()(counters)}) AS counters`;
        expect(remaining).toEqual({
          users: 0,
          requests: 0,
          analyses: 0,
          conversations: 0,
          grants: 0,
          counters: 0,
        });
      }
    } finally {
      await closeDb();
    }
  });

  it('giver kun den præcise godkendte besøgsidentitet live-adgang', async () => {
    await grant();
    const [shape] =
      await sql()`SELECT jsonb_typeof(data) AS kind FROM kaia_configuration WHERE key=${`live-grant:${owner.userId}`}`;
    expect(shape.kind).toBe('object');
    expect(await selectedProviderFor(owner)).toEqual(live);
    expect(await selectedProviderFor(otherOwner)).toEqual(demo);
    expect(mocks.activeProvider).not.toHaveBeenCalled();
    expect(await storedGrant(otherOwner)).toBeUndefined();
    const status = await providersForUser(owner);
    expect(status).toMatchObject([{ id: 'corti', model: live.model, active: true }]);
    expect(JSON.stringify(status)).not.toMatch(/secret|apiKey|fingerprint|endpoint|tenant|ownerId/);
    expect(JSON.stringify(await storedGrant())).not.toContain(live.secrets.apiKey);
    expect(owner.roles).toEqual(['KAIA.Finance']);
    expect(owner.unitIds).toEqual(['school-hoeng']);
  });

  it('afviser ikke-eksisterende eller forkert tenant før tildeling', async () => {
    await expect(
      grantLiveAccessForOwner(`demo:${randomUUID()}`, { providerId: 'corti' }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(grant(wrongTenant)).rejects.toMatchObject({ status: 404 });
    expect(await storedGrant(wrongTenant)).toBeUndefined();
  });

  it('tillader præcis én samtidig reservation og tæller ikke den tabende konkurrent', async () => {
    await grant();
    const outcomes = await Promise.allSettled([
      acquireLiveAnalysis(owner, live),
      acquireLiveAnalysis(owner, live),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    const failed = outcomes.find((outcome) => outcome.status === 'rejected');
    if (failed?.status === 'rejected') expect(failed.reason).toMatchObject({ status: 429 });
    expect((await usage()).map((row) => row.count)).toEqual([1]);
    expect((await storedGrant())?.lease?.token).toMatch(/^[a-f0-9-]{36}$/);
    for (const outcome of outcomes) if (outcome.status === 'fulfilled') await outcome.value();
    expect((await storedGrant())?.lease).toBeUndefined();
  });

  it('har uafhængige leases og kvoter for to godkendte ejere', async () => {
    await grant();
    await grant(otherOwner);
    const releases = await Promise.all([
      acquireLiveAnalysis(owner, live),
      acquireLiveAnalysis(otherOwner, live),
    ]);
    expect((await usage()).map((row) => row.count)).toEqual([1]);
    expect((await usage(otherOwner)).map((row) => row.count)).toEqual([1]);
    expect((await storedGrant())?.lease?.token).not.toBe(
      (await storedGrant(otherOwner))?.lease?.token,
    );
    await releases[0]();
    expect((await storedGrant(otherOwner))?.lease).toBeDefined();
    await releases[1]();
  });

  it('stopper ved den faktiske DB-kvote og nulstiller ikke tælleren ved fornyet godkendelse', async () => {
    await grant(owner, 2);
    for (let index = 0; index < 2; index++) await (await acquireLiveAnalysis(owner, live))();
    await expect(acquireLiveAnalysis(owner, live)).rejects.toMatchObject({ status: 429 });
    expect((await usage()).map((row) => row.count)).toEqual([2]);
    expect((await storedGrant())?.lease).toBeUndefined();
    await grant(owner, 2);
    await expect(acquireLiveAnalysis(owner, live)).rejects.toMatchObject({ status: 429 });
    expect((await usage()).map((row) => row.count)).toEqual([2]);
    const [window] = await usage();
    expect(window.window.getUTCHours()).toBe(0);
    expect(window.window.getUTCMinutes()).toBe(0);
    expect(window.window.getUTCSeconds()).toBe(0);
    expect(window.window.toISOString().slice(0, 10)).toBe(new Date().toISOString().slice(0, 10));
  });

  it('kan ikke omgå sidste ledige døgnplads med parallelle reservationer', async () => {
    await grant(owner, 1);
    const outcomes = await Promise.allSettled(
      Array.from({ length: 6 }, () => acquireLiveAnalysis(owner, live)),
    );
    const winners = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    expect(winners).toHaveLength(1);
    for (const outcome of outcomes)
      if (outcome.status === 'rejected') expect(outcome.reason).toMatchObject({ status: 429 });
    for (const winner of winners) if (winner.status === 'fulfilled') await winner.value();
    await expect(acquireLiveAnalysis(owner, live)).rejects.toMatchObject({ status: 429 });
    expect((await usage()).map((row) => row.count)).toEqual([1]);
  });

  it('bevarer en aktiv lease ved fornyet tildeling', async () => {
    await grant();
    const release = await acquireLiveAnalysis(owner, live);
    const token = (await storedGrant())?.lease?.token;
    await grant();
    expect((await storedGrant())?.lease?.token).toBe(token);
    await expect(acquireLiveAnalysis(owner, live)).rejects.toMatchObject({ status: 429 });
    expect((await usage()).map((row) => row.count)).toEqual([1]);
    await release();
    expect((await storedGrant())?.lease).toBeUndefined();
  });

  it('lader en gammel cleanup være uden effekt på en nyere lease', async () => {
    await grant();
    const oldRelease = await acquireLiveAnalysis(owner, live);
    const oldToken = (await storedGrant())?.lease?.token;
    await sql()`UPDATE kaia_configuration SET data=jsonb_set(data,'{lease,expiresAt}',${sql().json(new Date(Date.now() - 1_000).toISOString())}) WHERE key=${`live-grant:${owner.userId}`}`;
    const newRelease = await acquireLiveAnalysis(owner, live);
    const newToken = (await storedGrant())?.lease?.token;
    expect(newToken).not.toBe(oldToken);
    await oldRelease();
    expect((await storedGrant())?.lease?.token).toBe(newToken);
    await oldRelease();
    expect((await storedGrant())?.lease?.token).toBe(newToken);
    await newRelease();
    expect((await storedGrant())?.lease).toBeUndefined();
    expect((await usage()).map((row) => row.count)).toEqual([2]);
  });

  it('genkontrollerer udløb mellem provider-valg og reservation', async () => {
    await grant();
    expect(await selectedProviderFor(owner)).toEqual(live);
    await sql()`UPDATE kaia_configuration SET data=jsonb_set(data,'{expiresAt}',${sql().json(new Date(Date.now() - 1_000).toISOString())}) WHERE key=${`live-grant:${owner.userId}`}`;
    await expect(acquireLiveAnalysis(owner, live)).rejects.toMatchObject({ status: 403 });
    expect(await selectedProviderFor(owner)).toEqual(demo);
    expect(await usage()).toEqual([]);
    expect((await storedGrant())?.lease).toBeUndefined();
  });

  it('binder adgangen til præcis den godkendte model og credentials-fingerprint', async () => {
    await grant();
    const changed = { ...live, secrets: { apiKey: 'different-fixture-not-a-real-credential' } };
    mocks.getProvider.mockImplementation(async (id: string) => (id === 'demo' ? demo : changed));
    expect(await selectedProviderFor(owner)).toEqual(demo);
    await expect(acquireLiveAnalysis(owner, changed)).rejects.toMatchObject({ status: 403 });
    expect(await usage()).toEqual([]);
  });

  it('tilbagekalder kun ejerens running-jobs; completed og andre ejere bevares', async () => {
    await grant();
    await grant(otherOwner);
    const running = randomUUID(),
      foreign = randomUUID(),
      cancelled = randomUUID(),
      completed = randomUUID();
    await beginAnalysisRequest(owner, running);
    await beginAnalysisRequest(otherOwner, foreign);
    await cancelAnalysisRequest(owner, cancelled);
    const conversationId = randomUUID(),
      analysisId = randomUUID();
    await sql().begin(async (tx) => {
      await tx`INSERT INTO kaia_conversations(id,owner_id,title) VALUES(${conversationId},${owner.userId},'Privat tilbagekaldelsesprøve')`;
      await tx`INSERT INTO kaia_analyses(id,conversation_id,owner_id,data) VALUES(${analysisId},${conversationId},${owner.userId},'{}'::jsonb)`;
      await tx`INSERT INTO kaia_analysis_requests(request_id,owner_id,state,analysis_id) VALUES(${completed},${owner.userId},'completed',${analysisId})`;
    });
    const release = await acquireLiveAnalysis(owner, live);
    await revokeLiveAccessForOwner(owner.userId);
    expect((await analysisRequestStatus(owner, running))?.status).toBe('cancelled');
    expect((await analysisRequestStatus(owner, cancelled))?.status).toBe('cancelled');
    expect(await analysisRequestStatus(owner, completed)).toMatchObject({
      status: 'completed',
      analysisId,
      conversationId,
    });
    expect((await analysisRequestStatus(otherOwner, foreign))?.status).toBe('running');
    expect(await selectedProviderFor(owner)).toEqual(demo);
    expect(await selectedProviderFor(otherOwner)).toEqual(live);
    await expect(acquireLiveAnalysis(owner, live)).rejects.toMatchObject({ status: 403 });
    await release();
    expect((await storedGrant())?.revokedAt).toEqual(expect.any(String));
    expect((await storedGrant())?.lease).toBeUndefined();
  });

  it('tæller ikke Demo eller en afvist fremmed ejer som live-forbrug', async () => {
    await grant();
    await (
      await acquireLiveAnalysis(owner, demo)
    )();
    await expect(acquireLiveAnalysis(otherOwner, live)).rejects.toMatchObject({ status: 403 });
    expect(await usage()).toEqual([]);
    expect(await usage(otherOwner)).toEqual([]);
  });

  it('kan ikke genåbne betalt adgang når reservation og tilbagekaldelse konkurrerer', async () => {
    for (let iteration = 0; iteration < 4; iteration++) {
      await grant();
      const requestId = randomUUID();
      await beginAnalysisRequest(owner, requestId);
      const [reservation, revocation] =
        iteration % 2 === 0
          ? await Promise.allSettled([
              acquireLiveAnalysis(owner, live),
              revokeLiveAccessForOwner(owner.userId),
            ])
          : (
              await Promise.allSettled([
                revokeLiveAccessForOwner(owner.userId),
                acquireLiveAnalysis(owner, live),
              ])
            ).reverse();
      expect(revocation.status).toBe('fulfilled');
      if (reservation.status === 'fulfilled') {
        expect(typeof reservation.value).toBe('function');
        if (typeof reservation.value === 'function') await reservation.value();
      } else expect(reservation.reason).toMatchObject({ status: 403 });
      expect(await selectedProviderFor(owner)).toEqual(demo);
      expect((await analysisRequestStatus(owner, requestId))?.status).toBe('cancelled');
      await expect(acquireLiveAnalysis(owner, live)).rejects.toMatchObject({ status: 403 });
      const counters = await usage();
      expect(counters.reduce((sum, row) => sum + row.count, 0)).toBeLessThanOrEqual(1);
      await clearOwnFixtures();
    }
  });
});
