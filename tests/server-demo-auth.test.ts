import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { config } from 'dotenv';
const cookieState = vi.hoisted(() => ({
  values: new Map<string, string>(),
  options: new Map<string, Record<string, unknown>>(),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (key: string) => {
      const value = cookieState.values.get(key);
      return value ? { value } : undefined;
    },
    set: (key: string, value: string, options: Record<string, unknown>) => {
      cookieState.values.set(key, value);
      cookieState.options.set(key, options);
    },
    delete: (key: string) => {
      cookieState.values.delete(key);
      cookieState.options.delete(key);
    },
  }),
}));
import {
  authenticationMode,
  isDemoLoginEnabled,
  isLocalTest,
  DEMO_PROFILES,
  demoProfile,
  createDemoIdentity,
  accessForToken,
  installDemoSession,
  assertAdmin,
  SESSION_COOKIE,
} from '../src/server/auth';
import { POST as demoLogin } from '../src/app/auth/demo/route';
import { GET as sessionStatus } from '../src/app/api/session/route';
import * as repository from '../src/server/repository';
import * as providers from '../src/server/providers';
import { ApiError } from '../src/server/errors';
import { POST as analyzeRequest } from '../src/app/api/analyze/route';
import { GET as workspaceRequest } from '../src/app/api/workspace/route';
import { sql, closeDb } from '../src/server/db';
import {
  loadDatasetShell,
  loadDataset,
  saveAnalysis,
  ownedAnalysis,
  conversation,
  lists,
} from '../src/server/repository';
import { analyze, parseQuestion } from '../src/domain/analysis';

beforeEach(() => {
  cookieState.values.clear();
  cookieState.options.clear();
});
afterEach(() => vi.unstubAllEnvs());

describe('Eksplicit offentlig demologin: kontrakt og adgang', () => {
  it('har Entra som sikker standard og kræver eksplicit demotilvalg', () => {
    vi.stubEnv('KAIA_AUTH_MODE', '');
    expect(authenticationMode()).toBe('entra');
    expect(isDemoLoginEnabled()).toBe(false);
    vi.stubEnv('KAIA_AUTH_MODE', 'unknown');
    expect(authenticationMode()).toBe('entra');
    vi.stubEnv('KAIA_AUTH_MODE', 'demo');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('KAIA_TEST_MODE', '0');
    expect(isDemoLoginEnabled()).toBe(true);
    expect(isLocalTest()).toBe(false);
  });
  it('tillader kun tre serverprofiler og ingen administrationsrolle', () => {
    expect(Object.keys(DEMO_PROFILES)).toEqual(['executive', 'school', 'council']);
    expect(Object.values(DEMO_PROFILES).map((p) => p.role)).toEqual([
      'KAIA.Executive',
      'KAIA.DepartmentHead',
      'KAIA.Council',
    ]);
    expect(() => demoProfile('admin')).toThrow();
    expect(() => demoProfile({ profile: 'executive', roles: ['KAIA.Admin'] })).toThrow();
    expect(DEMO_PROFILES.executive.displayName).toBe('Parthee');
    expect(DEMO_PROFILES.school.displayName).toBe('Anne Dandanell');
  });
  it('afviser demo-endpoint i Entra-mode og afviser forfalsket Origin', async () => {
    vi.stubEnv('KAIA_AUTH_MODE', 'entra');
    expect(
      (await demoLogin(new Request('https://kaia.example/auth/demo', { method: 'POST' }))).status,
    ).toBe(404);
    vi.stubEnv('KAIA_AUTH_MODE', 'demo');
    vi.stubEnv('KAIA_APP_URL', 'https://kaia.example');
    const response = await demoLogin(
      new Request('https://kaia.example/auth/demo', {
        method: 'POST',
        headers: {
          origin: 'https://attacker.example',
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: 'profile=executive',
      }),
    );
    expect(response.status).toBe(403);
    expect(cookieState.values.size).toBe(0);
  });
  it('accepterer ikke klientindsendte rolle- eller profilfelter', async () => {
    vi.stubEnv('KAIA_AUTH_MODE', 'demo');
    vi.stubEnv('KAIA_APP_URL', 'https://kaia.example');
    for (const body of [
      'profile=admin',
      'profile=executive&role=KAIA.Admin',
      'profile=executive&profile=school',
    ]) {
      const response = await demoLogin(
        new Request('https://kaia.example/auth/demo', {
          method: 'POST',
          headers: {
            origin: 'https://kaia.example',
            'content-type': 'application/x-www-form-urlencoded',
          },
          body,
        }),
      );
      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe('https://kaia.example/?loginError=failed');
    }
    expect(cookieState.values.size).toBe(0);
  });
  it('bevarer loginbudgettets forståelige HTTP 429 uden redirect', async () => {
    vi.stubEnv('KAIA_AUTH_MODE', 'demo');
    vi.stubEnv('KAIA_APP_URL', 'https://kaia.example');
    vi.stubEnv('KAIA_SESSION_SECRET', 'fixture-session-'.repeat(4));
    const limiter = vi
      .spyOn(repository, 'consumeDemoLoginBudget')
      .mockRejectedValue(new ApiError(429, 'Demoens loginbudget er nået. Prøv igen senere.'));
    try {
      const response = await demoLogin(
        new Request('https://kaia.example/auth/demo', {
          method: 'POST',
          headers: {
            origin: 'https://kaia.example',
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: 'profile=executive',
        }),
      );
      expect(response.status).toBe(429);
      expect(response.headers.get('location')).toBeNull();
      expect((await response.json()).error).toContain('loginbudget');
      expect(cookieState.values.size).toBe(0);
    } finally {
      limiter.mockRestore();
    }
  });
  it('udleverer kun public opsætningsstatus uden authhemmeligheder til en anonym SSR-forespørgsel', async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('KAIA_AUTH_MODE', 'demo');
    vi.stubEnv('KAIA_SESSION_SECRET', 'fixture-secret-'.repeat(4));
    vi.stubEnv('KAIA_ENTRA_CLIENT_SECRET', 'private-client-secret');
    const response = await sessionStatus();
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(Object.keys(data).sort()).toEqual(['setup', 'user']);
    expect(data.user).toBeNull();
    expect(data.setup.authMode).toBe('demo');
    expect(data.setup.database).toBe(false);
    expect(JSON.stringify(data)).not.toContain('private-client-secret');
    expect(JSON.stringify(data)).not.toContain('fixture-secret-');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
});

const runDb = process.env.KAIA_DB_TEST === '1';
const created: string[] = [];
let fixtureUsageWindow: Date;
let fixtureAnalyses = 0;
async function fresh(profile: 'executive' | 'school' | 'council') {
  const result = await createDemoIdentity(profile);
  created.push(result.user.userId);
  return result;
}
describe.skipIf(!runDb)('Reel Postgres: demologin, private besøgende og modebinding', () => {
  beforeAll(async () => {
    config({ path: '.env.local', quiet: true });
    const [row] = await sql()`SELECT date_trunc('hour',now()) AS window`;
    fixtureUsageWindow = row.window;
  });
  beforeEach(() => {
    vi.stubEnv('KAIA_AUTH_MODE', 'demo');
    vi.stubEnv('KAIA_TEST_MODE', '0');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('KAIA_APP_URL', 'https://kaia.example');
  });
  afterAll(async () => {
    for (const id of created) {
      await sql()`DELETE FROM kaia_insights WHERE owner_id=${id}`;
      await sql()`DELETE FROM kaia_scenarios WHERE owner_id=${id}`;
      await sql()`DELETE FROM kaia_analyses WHERE owner_id=${id}`;
      await sql()`DELETE FROM kaia_conversations WHERE owner_id=${id}`;
      await sql()`DELETE FROM kaia_sessions WHERE user_id=${id}`;
      await sql()`DELETE FROM kaia_grants WHERE user_id=${id}`;
      await sql()`DELETE FROM kaia_users WHERE id=${id}`;
    }
    // Remove only this suite's consumed fixture tokens; concurrent real usage remains counted.
    await sql()`UPDATE kaia_usage SET count=GREATEST(0,count-${created.length}) WHERE user_id=${repository.DEMO_LOGIN_BUDGET_KEY} AND window_start=${fixtureUsageWindow}`;
    await sql()`UPDATE kaia_usage SET count=GREATEST(0,count-${fixtureAnalyses}) WHERE user_id=${repository.DEMO_ANALYSIS_BUDGET_KEY} AND window_start=${fixtureUsageWindow}`;
    for (const id of created) await sql()`DELETE FROM kaia_usage WHERE user_id=${id}`;
    await closeDb();
  });
  it('opretter en unik identitet for hver besøgende med samme visningsprofil', async () => {
    const a = await fresh('executive'),
      b = await fresh('executive');
    expect(a.user.userId).not.toBe(b.user.userId);
    expect(a.user.objectId).not.toBe(b.user.objectId);
    expect(a.token).not.toBe(b.token);
    expect(a.user.displayName).toBe(b.user.displayName);
    const [stored] =
      await sql()`SELECT test_only,demo_only,demo_profile FROM kaia_sessions WHERE user_id=${a.user.userId}`;
    expect(stored).toMatchObject({ test_only: 0, demo_only: 1, demo_profile: 'executive' });
    expect((await accessForToken(a.token))?.roles).toEqual(['KAIA.Executive']);
    expect(isLocalTest()).toBe(false);
  });
  it('beskytter samtaler og analyser mellem to besøgende med samme demoprofil', async () => {
    const a = await fresh('executive'),
      b = await fresh('executive');
    const shell = await loadDatasetShell(a.user);
    const context = parseQuestion('Vis budgetstatus for Høng Skole', a.user, shell);
    const data = await loadDataset(a.user, context);
    const saved = await saveAnalysis(
      a.user,
      analyze('Vis budgetstatus for Høng Skole', a.user, undefined, context, data),
    );
    expect((await ownedAnalysis(a.user, saved.analysisId)).analysisId).toBe(saved.analysisId);
    await expect(ownedAnalysis(b.user, saved.analysisId)).rejects.toMatchObject({ status: 404 });
    await expect(conversation(b.user, saved.conversationId!)).rejects.toMatchObject({
      status: 404,
    });
    expect((await lists(b.user)).conversations).toEqual([]);
  });
  it('projicerer serverens rolleloft og områdescope ved hvert sessionsopslag', async () => {
    const { token, user } = await fresh('school');
    await sql()`UPDATE kaia_users SET roles=${sql().json(['KAIA.Admin', 'KAIA.Executive'])},display_name='Administrator' WHERE id=${user.userId}`;
    await sql()`UPDATE kaia_grants SET unit_ids=${sql().json([...user.unitIds, 'org-jobcenter', '*'])},areas=${sql().json(['schools', 'social'])} WHERE user_id=${user.userId}`;
    const current = await accessForToken(token);
    expect(current?.roles).toEqual(['KAIA.DepartmentHead']);
    expect(current?.areas).toEqual(['schools']);
    expect(current?.unitIds).not.toContain('org-jobcenter');
    expect(current?.unitIds).not.toContain('*');
    expect(current?.displayName).toBe('Anne Dandanell');
    expect(() => assertAdmin(current!)).toThrow();
  });
  it('giver udvalgspolitisk scope uden administration', async () => {
    const { token } = await fresh('council');
    const current = await accessForToken(token);
    expect(current?.roles).toEqual(['KAIA.Council']);
    expect(current?.unitIds).toEqual(['committee-boern-familie']);
    expect(current?.areas).toEqual(['schools']);
    expect(() => assertAdmin(current!)).toThrow();
    const data = await loadDataset(current!);
    expect(data.documents.length).toBeGreaterThan(0);
    expect(
      data.documents.every((d) => d.classification === 'political' && d.area === 'schools'),
    ).toBe(true);
  });
  it('afviser en eksisterende demosession, når appen skifter til Entra', async () => {
    const { token } = await fresh('executive');
    expect(await accessForToken(token)).not.toBeNull();
    vi.stubEnv('KAIA_AUTH_MODE', 'entra');
    expect(await accessForToken(token)).toBeNull();
    await expect(createDemoIdentity('executive')).rejects.toMatchObject({ status: 404 });
  });
  it('sætter en sikker cookie til HTTPS-frontend og returnerer kun den aktuelle private profil via session-API', async () => {
    const user = await installDemoSession('school');
    created.push(user.userId);
    expect(cookieState.options.get(SESSION_COOKIE)).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });
    const token = cookieState.values.get(SESSION_COOKIE)!;
    const response = await sessionStatus();
    const body = await response.json();
    expect(body.setup.authMode).toBe('demo');
    expect(body.setup.ready).toBe(true);
    expect(body.user.userId).toBe(user.userId);
    expect(body.user.roles).toEqual(['KAIA.DepartmentHead']);
    expect(JSON.stringify(body)).not.toContain(token);
    expect(JSON.stringify(body)).not.toContain(process.env.KAIA_SESSION_SECRET);
  });
  it('håndhæver en fælles atomisk DB-grænse under samtidige anmodninger', async () => {
    const key = `budget-fixture:${crypto.randomUUID()}`;
    try {
      const outcomes = await Promise.allSettled(
        Array.from({ length: 6 }, () =>
          repository.consumeUsageBudget(key, 2, 'Fælles budget nået.'),
        ),
      );
      expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
      expect(outcomes.filter((r) => r.status === 'rejected')).toHaveLength(4);
      for (const r of outcomes)
        if (r.status === 'rejected') expect(r.reason).toMatchObject({ status: 429 });
      const [row] = await sql()`SELECT count FROM kaia_usage WHERE user_id=${key}`;
      expect(row.count).toBe(2);
    } finally {
      await sql()`DELETE FROM kaia_usage WHERE user_id=${key}`;
    }
  });
  it('tæller to forskellige besøgende i samme globale analysebudget', async () => {
    const a = await fresh('executive'),
      b = await fresh('executive');
    const [before] =
      await sql()`SELECT count FROM kaia_usage WHERE user_id=${repository.DEMO_ANALYSIS_BUDGET_KEY} AND window_start=date_trunc('hour',now())`;
    await repository.consumeAnalysisBudget(a.user);
    fixtureAnalyses++;
    await repository.consumeAnalysisBudget(b.user);
    fixtureAnalyses++;
    const [after] =
      await sql()`SELECT count FROM kaia_usage WHERE user_id=${repository.DEMO_ANALYSIS_BUDGET_KEY} AND window_start=date_trunc('hour',now())`;
    expect(after.count).toBe(Number(before?.count || 0) + 2);
  });
  it('viser og anvender kun Demo for offentlige sessions trods en live standardudbyder', async () => {
    const user = await installDemoSession('executive');
    created.push(user.userId);
    vi.stubEnv('KAIA_DEFAULT_PROVIDER', 'openai');
    const active = vi.spyOn(providers, 'activeProvider');
    const network = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('No external model calls permitted'));
    try {
      const workspace = await (await workspaceRequest()).json();
      expect(workspace.providers).toEqual([
        {
          id: 'demo',
          model: 'Deterministisk analyse',
          configured: true,
          active: true,
          status: 'Klar · uden eksterne modelkald',
        },
      ]);
      const response = await analyzeRequest(
        new Request('https://kaia.example/api/analyze', {
          method: 'POST',
          headers: { origin: 'https://kaia.example', 'content-type': 'application/json' },
          body: JSON.stringify({ question: 'Vis budgetstatus for Høng Skole' }),
        }),
      );
      fixtureAnalyses++;
      expect(response.status).toBe(200);
      const events = (await response.text())
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      const analysis = events.find((event) => event.type === 'analysis')?.analysis;
      expect(analysis.formulation.provider).toBe('demo');
      expect(active).not.toHaveBeenCalled();
      expect(network).not.toHaveBeenCalled();
    } finally {
      active.mockRestore();
      network.mockRestore();
    }
  });
});
