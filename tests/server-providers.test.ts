import { describe, it, expect, vi, afterEach } from 'vitest';
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '104.18.7.192', family: 4 }]),
}));
import {
  providerFetch,
  streamText,
  complete,
  normalizeProviderUpdate,
  connectionFingerprint,
  envConnection,
  providerSchema,
  validateEndpoint,
  type ProviderConnection,
} from '../src/server/providers';
const connection: ProviderConnection = {
  id: 'openai',
  model: 'configured-test-model',
  endpoint: 'https://api.openai.com/v1',
  secrets: { apiKey: 'fixture-only' },
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('Fire direkte provideradapteres REST-kontrakt (fixtures)', () => {
  it.each(['openai', 'mistral', 'azure', 'corti'] as const)(
    'sender %s korrekt auth og endpoint',
    async (id) => {
      const endpoint =
        id === 'openai'
          ? 'https://api.openai.com/v1'
          : id === 'mistral'
            ? 'https://api.mistral.ai/v1'
            : id === 'corti'
              ? 'https://ai.eu.corti.app/v1'
              : 'https://test-resource.openai.azure.com/openai/v1';
      const fn = vi.fn(async () => Response.json({ choices: [{ message: { content: 'ok' } }] }));
      vi.stubGlobal('fetch', fn);
      await complete({ ...connection, id, endpoint }, [{ role: 'user', content: 'test' }], []);
      const [url, options] = fn.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe(endpoint + '/chat/completions');
      const headers = options.headers as Record<string, string>;
      expect(id === 'azure' ? headers['api-key'] : headers.Authorization).toBe(
        id === 'azure' ? 'fixture-only' : 'Bearer fixture-only',
      );
      expect(options.redirect).toBe('error');
      expect(JSON.parse(options.body as string).model).toBe('configured-test-model');
    },
  );
  it.each(['eu', 'us', 'fr'] as const)(
    'sender Corti Models API-nøglen uændret til den valgte %s-region',
    async (region) => {
      const key = Buffer.from('base:client_credentials:fixture-client:fixture-secret').toString(
        'base64',
      );
      const fn = vi.fn(async () => Response.json({ data: [{ id: 'corti-s1' }] }));
      vi.stubGlobal('fetch', fn);
      await providerFetch(
        {
          ...connection,
          id: 'corti',
          model: 'corti-s1',
          endpoint: undefined,
          region,
          authMode: 'apiKey',
          secrets: { apiKey: key },
        },
        '/models',
      );
      const [url, options] = fn.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe(`https://ai.${region}.corti.app/v1/models`);
      expect(options.headers).toMatchObject({ Authorization: `Bearer ${key}` });
      expect(options.headers).not.toHaveProperty('Tenant-Name');
      expect(fn).toHaveBeenCalledTimes(1);
    },
  );
  it('parser kun synlig tekst og ignorerer reasoning fra Corti', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            'data: {"choices":[{"delta":{"reasoning":"private","content":"Hej "}}]}\n\ndata: {"choices":[{"delta":{"content":"kommune"}}]}\n\ndata: [DONE]\n\n',
          ),
      ),
    );
    let text = '';
    for await (const part of streamText(
      {
        ...connection,
        id: 'corti',
        region: 'fr',
        endpoint: 'https://ai.fr.corti.app/v1',
        model: 'corti-s1',
      },
      [{ role: 'user', content: 'test' }],
    ))
      text += part;
    expect(text).toBe('Hej kommune');
  });
  it('afviser afbrudt stream og giver brugbar rate-limit-fejl', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('data: {"choices":[{"delta":{"content":"Delvist"}}]}\n\n')),
    );
    await expect(async () => {
      for await (const _part of streamText(connection, [])) {
        void _part;
      }
    }).rejects.toMatchObject({ status: 502 });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 429 })),
    );
    await expect(providerFetch(connection, '/models')).rejects.toMatchObject({ status: 429 });
  });
  it('understøtter Corti OAuth og fornyer udløbne tokens', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        return url.includes('/token')
          ? Response.json({ access_token: 'fixture-token', expires_in: 0 })
          : Response.json({ data: [] });
      }),
    );
    const p: ProviderConnection = {
      ...connection,
      id: 'corti',
      endpoint: 'https://ai.eu.corti.app/v1',
      region: 'eu',
      authMode: 'oauth',
      tenant: 'base',
      secrets: { clientId: 'test-client', clientSecret: 'test-secret' },
    };
    await providerFetch(p, '/models');
    await providerFetch(p, '/models');
    expect(
      calls.filter((x) =>
        x.includes('auth.eu.corti.app/realms/base/protocol/openid-connect/token'),
      ),
    ).toHaveLength(2);
    expect(calls.filter((x) => x === 'https://ai.eu.corti.app/v1/models')).toHaveLength(2);
  });
  it('holder FR OAuth-realm og Models-endpoint i samme region', async () => {
    const fn = vi.fn(async (url: string) =>
      url.includes('/token')
        ? Response.json({ access_token: 'fixture-fr-token', expires_in: 0 })
        : Response.json({ data: [{ id: 'corti-s1' }] }),
    );
    vi.stubGlobal('fetch', fn);
    await providerFetch(
      {
        ...connection,
        id: 'corti',
        model: 'corti-s1',
        endpoint: 'https://ai.fr.corti.app/v1',
        region: 'fr',
        authMode: 'oauth',
        tenant: 'base',
        secrets: { clientId: 'fixture-fr-client', clientSecret: 'fixture-secret' },
      },
      '/models',
    );
    const [tokenUrl, tokenOptions] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(tokenUrl).toBe('https://auth.fr.corti.app/realms/base/protocol/openid-connect/token');
    expect(tokenOptions.body).toBeInstanceOf(URLSearchParams);
    expect((tokenOptions.body as URLSearchParams).get('grant_type')).toBe('client_credentials');
    const [url, options] = fn.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe('https://ai.fr.corti.app/v1/models');
    expect(options.headers).toMatchObject({
      Authorization: 'Bearer fixture-fr-token',
      'Tenant-Name': 'base',
    });
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('Corti-regioner og miljøkonfiguration', () => {
  it.each(['eu', 'us', 'fr'] as const)('bevarer %s fra miljøet uden fallback', (region) => {
    vi.stubEnv('KAIA_CORTI_REGION', region);
    vi.stubEnv('KAIA_CORTI_ENDPOINT', '');
    vi.stubEnv('KAIA_CORTI_API_KEY', 'fixture-only');
    vi.stubEnv('KAIA_CORTI_CLIENT_ID', '');
    vi.stubEnv('KAIA_CORTI_CLIENT_SECRET', '');
    const config = envConnection('corti');
    expect(config.region).toBe(region);
    expect(config.endpoint).toBe(`https://ai.${region}.corti.app/v1`);
    expect(config.tested).toBe(false);
    expect(providerSchema.safeParse({ id: 'corti', model: 'corti-s1', region }).success).toBe(true);
  });
  it('bruger EU uden angivet region og afviser en ukendt region', () => {
    vi.stubEnv('KAIA_CORTI_REGION', '');
    vi.stubEnv('KAIA_CORTI_ENDPOINT', '');
    vi.stubEnv('KAIA_CORTI_API_KEY', 'fixture-only');
    vi.stubEnv('KAIA_CORTI_CLIENT_ID', '');
    vi.stubEnv('KAIA_CORTI_CLIENT_SECRET', '');
    expect(envConnection('corti').region).toBe('eu');
    vi.stubEnv('KAIA_CORTI_REGION', 'unknown');
    expect(() => envConnection('corti')).toThrow('KAIA_CORTI_REGION skal være eu, us eller fr.');
    expect(
      providerSchema.safeParse({ id: 'corti', model: 'corti-s1', region: 'unknown' }).success,
    ).toBe(false);
  });
  it('accepterer FR-host alene for FR og afviser andre Corti-produkter', () => {
    expect(validateEndpoint('corti', 'https://ai.fr.corti.app/v1', 'fr')).toBe(
      'https://ai.fr.corti.app/v1',
    );
    for (const [endpoint, region] of [
      ['https://ai.fr.corti.app/v1', 'eu'],
      ['https://ai.eu.corti.app/v1', 'fr'],
      ['https://api.fr.corti.app/v1', 'fr'],
      ['https://auth.fr.corti.app/v1', 'fr'],
      ['https://ai.fr.corti.app.evil.example/v1', 'fr'],
    ] as const)
      expect(() => validateEndpoint('corti', endpoint, region)).toThrow();
  });
});

describe('Gemte providerfelter', () => {
  it('skifter fra EU til FR uden at genbruge gammelt endpoint eller godkendelse', () => {
    const old: ProviderConnection = {
      ...connection,
      id: 'corti',
      model: 'corti-s1',
      region: 'eu',
      endpoint: 'https://ai.eu.corti.app/v1',
      tested: true,
    };
    const result = normalizeProviderUpdate(old, {
      id: 'corti',
      model: old.model,
      region: 'fr',
    });
    expect(result.data.region).toBe('fr');
    expect(result.data.endpoint).toBe('https://ai.fr.corti.app/v1');
    expect(result.data.tested).toBe(false);
    expect(result.secrets).toEqual(old.secrets);
    expect(connectionFingerprint({ ...result.data, secrets: result.secrets })).not.toBe(
      connectionFingerprint(old),
    );
    expect(() =>
      normalizeProviderUpdate(old, {
        id: 'corti',
        model: old.model,
        region: 'fr',
        endpoint: old.endpoint,
      }),
    ).toThrow();
    expect(() =>
      normalizeProviderUpdate(old, {
        id: 'corti',
        model: old.model,
        region: 'fr',
        active: true,
      }),
    ).toThrow('Gem forbindelsen, test den, og aktivér den derefter.');
  });
  it('bevarer Corti OAuth og US-region ved aktivering uden nye secretfelter', () => {
    const old: ProviderConnection = {
      id: 'corti',
      model: 'configured-model',
      endpoint: 'https://ai.us.corti.app/v1',
      region: 'us',
      authMode: 'oauth',
      tenant: 'base',
      tested: true,
      secrets: { clientId: 'fixture', clientSecret: 'secret' },
    };
    const result = normalizeProviderUpdate(old, {
      id: 'corti',
      model: 'configured-model',
      active: true,
    });
    expect(result.data.authMode).toBe('oauth');
    expect(result.data.region).toBe('us');
    expect(result.data.endpoint).toBe(old.endpoint);
    expect(result.secrets).toEqual(old.secrets);
    expect(result.data.tested).toBe(true);
    expect(JSON.stringify(result.data)).not.toContain('clientSecret');
  });
  it('normaliserer trailing slash uden at invalidere en testet forbindelse', () => {
    const old = { ...connection, tested: true };
    expect(
      normalizeProviderUpdate(old, {
        id: 'openai',
        model: old.model,
        endpoint: old.endpoint + '/',
        active: true,
      }).data.tested,
    ).toBe(true);
  });
  it('kan rydde tidligere modelparametre eksplicit uden at ændre hemmeligheder', () => {
    const old = { ...connection, tested: true, temperature: 0.4, maxTokens: 2000 };
    const result = normalizeProviderUpdate(old, {
      id: 'openai',
      model: old.model,
      temperature: null,
      maxTokens: null,
    });
    expect(result.data.temperature).toBeUndefined();
    expect(result.data.maxTokens).toBeUndefined();
    expect(result.data.tested).toBe(false);
    expect(result.secrets).toEqual(old.secrets);
    expect(JSON.stringify(result.data)).not.toContain('temperature');
  });
  it('binder testresultater til model, credentials og parametre', () => {
    expect(connectionFingerprint(connection)).not.toBe(
      connectionFingerprint({ ...connection, secrets: { apiKey: 'changed' } }),
    );
    expect(connectionFingerprint(connection)).not.toBe(
      connectionFingerprint({ ...connection, model: 'another-model' }),
    );
    expect(() =>
      normalizeProviderUpdate(
        { ...connection, tested: true },
        { id: 'openai', model: 'changed-model', active: true },
      ),
    ).toThrow();
  });
});
