import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { encryptSecret, decryptSecret, hashSession } from '../src/server/crypto';
import {
  validateEndpoint,
  isPrivateAddress,
  configured,
  providerSchema,
} from '../src/server/providers';
import { isLocalTest, validateIdentity } from '../src/server/auth';
import { readJson, assumptionsSchema } from '../src/server/validation';
import { assertAnalysisAccess } from '../src/server/repository';
import { getDataset } from '../src/domain/data';
import { analyze } from '../src/domain/analysis';
import { scopedTools } from '../src/server/tools';
import type { AccessContext } from '../src/domain/types';
const tenant = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  oid = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const school: AccessContext = {
  userId: 'fixture',
  tenantId: tenant,
  objectId: oid,
  displayName: 'Fagchef',
  title: 'Chef',
  roles: ['KAIA.DepartmentHead'],
  unitIds: ['*'],
  areas: ['schools'],
};
const data = getDataset();
beforeEach(() => {
  vi.stubEnv('KAIA_ENCRYPTION_KEY', Buffer.alloc(32, 5).toString('base64'));
  vi.stubEnv('KAIA_SESSION_SECRET', 'a'.repeat(48));
  vi.stubEnv('KAIA_ENTRA_TENANT_ID', tenant);
  vi.stubEnv('KAIA_APP_URL', 'http://127.0.0.1:3210');
});
afterEach(() => vi.unstubAllEnvs());
describe('Serverhemmeligheder og autentifikation', () => {
  it('krypterer randomiseret, autentificeret AES-GCM og afviser manipulation', () => {
    const a = encryptSecret('fixture-secret'),
      b = encryptSecret('fixture-secret');
    expect(a).not.toBe(b);
    expect(a).not.toContain('fixture-secret');
    expect(decryptSecret(a)).toBe('fixture-secret');
    const parts = a.split('.');
    parts[2] = Buffer.alloc(16, 1).toString('base64url');
    expect(() => decryptSecret(parts.join('.'))).toThrow();
  });
  it('binder sessionsopslag til serverhemmeligheden', () => {
    const a = hashSession('fixture');
    vi.stubEnv('KAIA_SESSION_SECRET', 'b'.repeat(48));
    expect(hashSession('fixture')).not.toBe(a);
  });
  it('godtager kun konfigureret tenant og stabile object-ID; ignorerer displaynavn', () => {
    expect(
      validateIdentity({ tid: tenant, oid, roles: ['KAIA.Finance', 'evil'], name: 'KAIA.Admin' })
        .roles,
    ).toEqual(['KAIA.Finance']);
    expect(() => validateIdentity({ tid: oid, oid, roles: ['KAIA.Admin'] })).toThrow();
    expect(() => validateIdentity({ tid: tenant, oid: 'name', roles: ['KAIA.Admin'] })).toThrow();
    expect(validateIdentity({ tid: tenant, oid, name: 'KAIA.Admin' }).roles).toEqual([]);
  });
  it('deaktiverer testidentiteter på Vercel og i produktion', () => {
    vi.stubEnv('KAIA_TEST_MODE', '1');
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('VERCEL', '');
    expect(isLocalTest()).toBe(true);
    vi.stubEnv('VERCEL', '1');
    expect(isLocalTest()).toBe(false);
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('NODE_ENV', 'production');
    expect(isLocalTest()).toBe(false);
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('KAIA_APP_URL', 'https://kaia.example');
    expect(isLocalTest()).toBe(false);
  });
});
describe('Provider- og inputkontrakter', () => {
  it.each([
    ['openai', 'https://api.openai.com/v1'],
    ['mistral', 'https://api.mistral.ai/v1'],
    ['corti', 'https://ai.eu.corti.app/v1'],
    ['azure', 'https://kaia-resource.openai.azure.com/openai/v1'],
  ] as const)('godkender dokumenteret %s endpoint', (id, url) =>
    expect(validateEndpoint(id, url)).toBe(url),
  );
  it.each([
    'http://api.openai.com/v1',
    'https://127.0.0.1/v1',
    'https://api.openai.com.evil.example/v1',
    'https://user:pass@api.openai.com/v1',
    'https://api.openai.com:444/v1',
    'https://api.openai.com/v1?url=internal',
    'https://api.openai.com/not-v1',
  ])('afviser endpoint %s', (url) => expect(() => validateEndpoint('openai', url)).toThrow());
  it.each([
    '127.0.0.1',
    '10.0.1.2',
    '172.16.0.2',
    '192.168.3.4',
    '169.254.169.254',
    '::1',
    'fd00::1',
    '::ffff:127.0.0.1',
  ])('afviser privat adresse %s', (ip) => expect(isPrivateAddress(ip)).toBe(true));
  it('kræver nøgler og en konkret model; tillader ikke klientindsendt teststatus', () => {
    expect(
      configured({
        id: 'openai',
        model: 'model',
        endpoint: 'https://api.openai.com/v1',
        secrets: {},
      }),
    ).toBe(false);
    expect(providerSchema.safeParse({ id: 'openai', model: 'model', tested: true }).success).toBe(
      false,
    );
    expect(assumptionsSchema.safeParse({ energyPercent: 999 }).success).toBe(false);
  });
  it('afviser cross-site JSON og overstore forespørgsler', async () => {
    const schema = providerSchema;
    await expect(
      readJson(
        new Request('http://127.0.0.1:3210/api/providers', {
          method: 'POST',
          headers: { origin: 'https://attacker.example', 'content-type': 'application/json' },
          body: '{}',
        }),
        schema,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      readJson(
        new Request('http://127.0.0.1:3210/api/providers', {
          method: 'POST',
          headers: { origin: 'http://127.0.0.1:3210', 'content-type': 'application/json' },
          body: ' '.repeat(24001),
        }),
        schema,
      ),
    ).rejects.toMatchObject({ status: 413 });
  });
});
describe('Værktøjer og gemte analyser', () => {
  it('genkontrollerer aktuelt scope for en gammel analyse', () => {
    const result = analyze('Giv budgetstatus på skoleområdet', school, undefined, undefined, data);
    expect(() =>
      assertAnalysisAccess({ ...school, areas: ['facilities'] }, result, data.entities),
    ).toThrow();
  });
  it('binder værktøjer til sessionens scope og afviser rolleargumenter', async () => {
    const basis = analyze('Vis budgetstatus på skoleområdet', school, undefined, undefined, data);
    const tools = scopedTools(school, data, basis);
    await expect(
      tools.execute('calculate_analysis', {
        question: 'Vis budgetstatus',
        area: 'social',
        entityIds: ['org-jobcenter'],
        year: 2026,
        fromMonth: 1,
        toMonth: 9,
      }),
    ).rejects.toThrow();
    await expect(
      tools.execute('calculate_analysis', {
        question: 'Vis budgetstatus',
        area: 'schools',
        entityIds: ['school-hoeng'],
        year: 2026,
        fromMonth: 1,
        toMonth: 9,
        role: 'KAIA.Admin',
      }),
    ).rejects.toThrow();
    await expect(
      tools.execute('get_document', { documentId: 'DEMO-DOC-social-2026-note' }),
    ).rejects.toThrow();
  });
  it('afviser at en live-model flytter analysens periode eller grafgrundlag', async () => {
    const basis = analyze('Vis budgetstatus på skoleområdet', school, undefined, undefined, data);
    const tools = scopedTools(school, data, basis);
    await expect(
      tools.execute('calculate_analysis', {
        question: 'Vis budgetstatus på skoleområdet',
        area: 'schools',
        entityIds: basis.context.entityIds,
        year: 2025,
        fromMonth: 1,
        toMonth: 9,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(tools.currentAnalysis()).toBe(basis);
  });
  it('leverer kun adgangsfiltrerede dokumentuddrag', async () => {
    const basis = analyze('Vis budgetstatus på skoleområdet', school, undefined, undefined, data);
    const result = (await scopedTools(school, data, basis).execute('search_documents', {
      query: 'energi',
    })) as Array<{ id: string }>;
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((d) => d.id.includes('schools'))).toBe(true);
  });
});

describe('Dansk CSV med entydige enheder', () => {
  it('konverterer øre til kroner og bevarer elevtal', async () => {
    const { analysisCsv } = await import('../src/server/export');
    const a = analyze(
      'Sammenlign Høng Skole og Svebølle Skole',
      school,
      undefined,
      undefined,
      data,
    );
    a.chart!.rows = [{ label: 'Fixture', budget: 12345, actual: -6789, pupils: 100 }];
    const csv = analysisCsv(a);
    expect(csv).toContain('(kr.)');
    expect(csv).toContain('"123,45"');
    expect(csv).toContain('"-67,89"');
    expect(csv).toContain('"100"');
    expect(csv).not.toContain('"12345"');
  });
});
