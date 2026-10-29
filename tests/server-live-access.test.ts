import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessContext } from '../src/domain/types';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getProvider: vi.fn(),
  activeProvider: vi.fn(),
  publicProviders: vi.fn(),
  fingerprint: vi.fn(),
}));
vi.mock('@/server/db', () => ({
  sql: () => ({
    unsafe: mocks.query,
    begin: async (work: (tx: unknown) => unknown) => work({ unsafe: mocks.query }),
  }),
}));
vi.mock('@/server/providers', () => ({
  getProvider: mocks.getProvider,
  activeProvider: mocks.activeProvider,
  publicProviders: mocks.publicProviders,
  connectionFingerprint: mocks.fingerprint,
  configured: (provider: { id: string; model?: string; secrets?: { apiKey?: string } }) =>
    provider.id === 'demo' || !!(provider.model && provider.secrets?.apiKey),
}));
import {
  selectedProviderFor,
  providersForUser,
  grantLiveAccessForOwner,
  revokeLiveAccessForOwner,
  acquireLiveAnalysis,
} from '../src/server/live-access';

const ownerId = 'demo:11111111-1111-4111-8111-111111111111';
const user: AccessContext = {
  userId: ownerId,
  tenantId: 'kaia-demo',
  objectId: ownerId.slice(5),
  displayName: 'Parthee',
  title: 'AI Program Lead',
  roles: ['KAIA.Executive'],
  areas: ['schools'],
  unitIds: ['school-hoeng'],
};
const live = {
  id: 'corti' as const,
  model: 'corti-s1-instant',
  tested: true,
  endpoint: 'https://ai.fr.corti.app/v1',
  region: 'fr' as const,
  secrets: { apiKey: 'fixture-only' },
};
const demo = { id: 'demo' as const, model: 'Deterministisk analyse', tested: true, secrets: {} };
const fingerprint = 'a'.repeat(64);
const initialGrant = () => ({
  version: 1,
  ownerId,
  providerId: 'corti',
  model: live.model,
  fingerprint,
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
  dailyLimit: 60,
});
let stored: Record<string, unknown> | undefined;
let usageAllowed: boolean;
beforeEach(() => {
  vi.resetAllMocks();
  stored = undefined;
  usageAllowed = true;
  mocks.fingerprint.mockReturnValue(fingerprint);
  mocks.getProvider.mockImplementation(async (id) => (id === 'demo' ? demo : live));
  mocks.activeProvider.mockResolvedValue(demo);
  mocks.publicProviders.mockResolvedValue([{ id: 'demo', active: true }]);
  mocks.query.mockImplementation(async (query: string, args: unknown[]) => {
    if (query.startsWith('SELECT id FROM kaia_users')) return [{ id: ownerId }];
    if (query.startsWith('SELECT data FROM kaia_configuration'))
      return stored ? [{ data: structuredClone(stored) }] : [];
    if (query.startsWith('INSERT INTO kaia_usage')) return usageAllowed ? [{ count: 1 }] : [];
    if (query.startsWith('INSERT INTO kaia_configuration')) {
      stored = JSON.parse(args[1] as string);
      return [];
    }
    if (query.includes("SET data=jsonb_set(data,'{lease}'")) {
      stored!.lease = JSON.parse(args[1] as string);
      return [];
    }
    if (query.includes("SET data=data-'lease'")) {
      if ((stored?.lease as { token: string } | undefined)?.token === args[1]) delete stored!.lease;
      return [];
    }
    return [];
  });
});
afterEach(() => vi.restoreAllMocks());

describe('server-only owner-bound live grants', () => {
  it('keeps every ungranted public visitor on Demo without consulting the global provider', async () => {
    mocks.activeProvider.mockResolvedValue(live);
    expect(await selectedProviderFor(user)).toEqual(demo);
    expect(mocks.activeProvider).not.toHaveBeenCalled();
    expect(mocks.getProvider).toHaveBeenCalledExactlyOnceWith('demo');
  });
  it('does not inherit a grant through the display name, selected profile or another visitor UUID', async () => {
    stored = initialGrant();
    expect(
      await selectedProviderFor({ ...user, userId: 'demo:22222222-2222-4222-8222-222222222222' }),
    ).toEqual(demo);
  });
  it('selects the granted tested connection even when the global default stays Demo', async () => {
    stored = initialGrant();
    expect(await selectedProviderFor(user)).toEqual(live);
    expect(mocks.getProvider).toHaveBeenCalledExactlyOnceWith('corti');
    expect(mocks.activeProvider).not.toHaveBeenCalled();
    expect(user.roles).toEqual(['KAIA.Executive']);
    expect(user.unitIds).toEqual(['school-hoeng']);
  });
  it.each(['expired', 'revoked', 'wrong-model', 'changed-fingerprint', 'untested', 'malformed'])(
    'fails closed for %s grants/connections',
    async (kind) => {
      stored = initialGrant();
      if (kind === 'expired') stored.expiresAt = new Date(Date.now() - 1).toISOString();
      if (kind === 'revoked') stored.revokedAt = new Date().toISOString();
      if (kind === 'wrong-model') stored.model = 'another-model';
      if (kind === 'changed-fingerprint') mocks.fingerprint.mockReturnValue('b'.repeat(64));
      if (kind === 'untested')
        mocks.getProvider.mockImplementation(async (id) =>
          id === 'demo' ? demo : { ...live, tested: false },
        );
      if (kind === 'malformed') stored.dailyLimit = 10000;
      expect(await selectedProviderFor(user)).toEqual(demo);
    },
  );
  it('retains normal Entra provider selection', async () => {
    mocks.activeProvider.mockResolvedValue(live);
    expect(await selectedProviderFor({ ...user, userId: 'tenant:object' })).toEqual(live);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it('projects consistent workspace status without endpoints, region, fingerprints or secrets', async () => {
    stored = initialGrant();
    const status = await providersForUser(user);
    expect(status).toEqual([
      {
        id: 'corti',
        model: live.model,
        configured: true,
        active: true,
        status: 'Privat live-adgang · højst 60 forespørgsler pr. døgn',
      },
    ]);
    expect(JSON.stringify(status)).not.toMatch(/endpoint|secret|apiKey|fingerprint|ai\.fr/);
  });
  it('creates a bounded private grant and returns only nonidentifying approval metadata', async () => {
    const result = await grantLiveAccessForOwner(ownerId, { providerId: 'corti' });
    expect(result).toEqual({
      granted: true,
      provider: 'corti',
      expiresAt: stored!.expiresAt,
      dailyLimit: 60,
    });
    expect(stored).toMatchObject({ ownerId, fingerprint, providerId: 'corti', dailyLimit: 60 });
    expect(
      Date.parse(stored!.expiresAt as string) - Date.parse(stored!.createdAt as string),
    ).toBeLessThanOrEqual(30 * 86400000 + 5);
    expect(JSON.stringify(result)).not.toContain(ownerId);
    expect(JSON.stringify(stored)).not.toContain('fixture-only');
  });
  it('rejects nonexistent identities and an untested connection before writing a grant', async () => {
    mocks.query.mockResolvedValueOnce([]);
    await expect(grantLiveAccessForOwner(ownerId, { providerId: 'corti' })).rejects.toMatchObject({
      status: 404,
    });
    mocks.getProvider.mockResolvedValueOnce({ ...live, tested: false });
    await expect(grantLiveAccessForOwner(ownerId, { providerId: 'corti' })).rejects.toMatchObject({
      status: 409,
    });
    expect(stored).toBeUndefined();
  });
  it.each([{ days: 31 }, { days: 0 }, { dailyLimit: 61 }, { dailyLimit: 0 }])(
    'cannot expand the server limits through private input %j',
    async (bad) => {
      await expect(
        grantLiveAccessForOwner(ownerId, { providerId: 'corti', ...bad }),
      ).rejects.toThrow();
      expect(mocks.query).not.toHaveBeenCalled();
    },
  );
  it('serializes a single active lease, consumes a UTC daily budget and releases only its own token', async () => {
    stored = initialGrant();
    const release = await acquireLiveAnalysis(user, live);
    expect(stored.lease).toMatchObject({
      token: expect.any(String),
      expiresAt: expect.any(String),
    });
    expect(mocks.query.mock.calls.some(([query]) => query.endsWith('FOR UPDATE'))).toBe(true);
    expect(
      mocks.query.mock.calls.some(
        ([query]) => query.includes("date_trunc('day'") && query.includes("'UTC'"),
      ),
    ).toBe(true);
    await expect(acquireLiveAnalysis(user, live)).rejects.toMatchObject({ status: 429 });
    await release();
    expect(stored.lease).toBeUndefined();
    const second = await acquireLiveAnalysis(user, live);
    const nextToken = (stored.lease as { token: string }).token;
    await release();
    expect((stored.lease as { token: string }).token).toBe(nextToken);
    await second();
    expect(stored.lease).toBeUndefined();
  });
  it('denies the 61st live request before installing a lease and counts no public Demo call', async () => {
    stored = initialGrant();
    usageAllowed = false;
    await expect(acquireLiveAnalysis(user, live)).rejects.toMatchObject({ status: 429 });
    expect(stored.lease).toBeUndefined();
    mocks.query.mockClear();
    await (
      await acquireLiveAnalysis(user, demo)
    )();
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it('rechecks revocation/expiry between provider selection and model-call reservation', async () => {
    stored = initialGrant();
    expect(await selectedProviderFor(user)).toEqual(live);
    stored.revokedAt = new Date().toISOString();
    await expect(acquireLiveAnalysis(user, live)).rejects.toMatchObject({ status: 403 });
  });
  it('marks outstanding durable requests cancelled on private revocation', async () => {
    await revokeLiveAccessForOwner(ownerId);
    expect(
      mocks.query.mock.calls.some(
        ([query, params]) => query.includes("state='cancelled'") && params[0] === ownerId,
      ),
    ).toBe(true);
  });
});
