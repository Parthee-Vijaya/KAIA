import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { z } from 'zod';
import { sql } from './db';
import { decryptSecret, encryptSecret } from './crypto';
import { ApiError } from './errors';
import type { CortiRegion, ProviderId, ProviderPublic } from '@/domain/types';
export type RemoteProvider = Exclude<ProviderId, 'demo'>;
export interface ProviderConfig {
  id: ProviderId;
  model: string;
  endpoint?: string;
  region?: CortiRegion;
  authMode?: 'apiKey' | 'oauth';
  tenant?: string;
  temperature?: number;
  maxTokens?: number;
  status?: string;
  tested?: boolean;
  testedFingerprint?: string;
}
export interface ProviderSecrets {
  apiKey?: string;
  clientId?: string;
  clientSecret?: string;
}
export interface ProviderConnection extends ProviderConfig {
  secrets: ProviderSecrets;
}
export const providerSchema = z
  .object({
    id: z.enum(['demo', 'openai', 'azure', 'mistral', 'corti']),
    model: z
      .string()
      .trim()
      .max(120)
      .regex(/^[a-zA-Z0-9._:/-]*$/),
    endpoint: z.string().trim().max(300).optional(),
    region: z.enum(['eu', 'us', 'fr']).optional(),
    authMode: z.enum(['apiKey', 'oauth']).optional(),
    tenant: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,80}$/)
      .optional(),
    apiKey: z.string().max(4000).optional(),
    clientId: z.string().max(300).optional(),
    clientSecret: z.string().max(4000).optional(),
    active: z.boolean().optional(),
    temperature: z.number().min(0).max(2).nullable().optional(),
    maxTokens: z.number().int().min(100).max(4096).nullable().optional(),
  })
  .strict();
const IDS: ProviderId[] = ['demo', 'mistral', 'corti', 'azure', 'openai'];
function defaultEndpoint(id: ProviderId, region: CortiRegion = 'eu') {
  return id === 'openai'
    ? 'https://api.openai.com/v1'
    : id === 'mistral'
      ? 'https://api.mistral.ai/v1'
      : id === 'corti'
        ? `https://ai.${region}.corti.app/v1`
        : '';
}
export function validateEndpoint(id: ProviderId, endpoint: string, region: CortiRegion = 'eu') {
  const u = new URL(endpoint);
  if (
    u.protocol !== 'https:' ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    u.port ||
    isIP(u.hostname)
  )
    throw new ApiError(400, 'Endpoint skal bruge HTTPS på udbyderens offentlige værtsnavn.');
  const allowed =
    id === 'openai'
      ? u.hostname === 'api.openai.com'
      : id === 'mistral'
        ? u.hostname === 'api.mistral.ai'
        : id === 'corti'
          ? ['eu', 'us', 'fr'].includes(region) && u.hostname === `ai.${region}.corti.app`
          : id === 'azure'
            ? /^[a-z0-9][a-z0-9-]{0,62}\.(openai\.azure\.com|services\.ai\.azure\.com)$/.test(
                u.hostname,
              )
            : false;
  if (!allowed) throw new ApiError(400, 'Endpoint tilhører ikke den valgte udbyder.');
  const expected = id === 'azure' ? '/openai/v1' : '/v1';
  if (u.pathname.replace(/\/$/, '') !== expected)
    throw new ApiError(400, `Endpoint skal slutte med ${expected}.`);
  return u.origin + expected;
}
export function isPrivateAddress(ip: string) {
  return (
    ip === '::1' ||
    ip === '::' ||
    ip.toLowerCase().startsWith('fc') ||
    ip.toLowerCase().startsWith('fd') ||
    /^fe[89ab]/i.test(ip) ||
    ip.toLowerCase().startsWith('ff') ||
    ip.toLowerCase().startsWith('::ffff:') ||
    /^(0|10|127|169\.254|192\.168)\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip) ||
    /^(22[4-9]|23\d|24\d|25[0-5])\./.test(ip)
  );
}
async function publicDns(url: string) {
  const records = await lookup(new URL(url).hostname, { all: true });
  if (!records.length || records.some((r) => isPrivateAddress(r.address)))
    throw new ApiError(400, 'Endpoint må ikke pege på et privat netværk.');
}
const oauthTokens = new Map<string, { token: string; expires: number }>();
async function bearer(config: ProviderConnection) {
  if (config.id !== 'corti' || config.authMode !== 'oauth') {
    if (!config.secrets.apiKey) throw new ApiError(503, 'API-nøglen mangler.');
    return config.secrets.apiKey;
  }
  const { clientId, clientSecret } = config.secrets;
  if (!clientId || !clientSecret) throw new ApiError(503, 'Corti client credentials mangler.');
  const key = `${config.region || 'eu'}:${config.tenant || 'base'}:${clientId}`;
  const old = oauthTokens.get(key);
  if (old && old.expires > Date.now() + 30_000) return old.token;
  const endpoint = `https://auth.${config.region || 'eu'}.corti.app/realms/${config.tenant || 'base'}/protocol/openid-connect/token`;
  await publicDns(endpoint);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'openid',
    }),
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw providerError(response.status);
  const data = await response.json();
  if (typeof data.access_token !== 'string' || typeof data.expires_in !== 'number')
    throw new ApiError(502, 'Corti returnerede et ugyldigt tokenformat.');
  oauthTokens.set(key, {
    token: data.access_token,
    expires: Date.now() + Math.min(data.expires_in, 3600) * 1000,
  });
  return data.access_token;
}
export function providerError(status: number) {
  return new ApiError(
    status === 429 ? 429 : 502,
    status === 401 || status === 403
      ? 'Udbyderen afviste credentials. Kontrollér adgang og nøgle.'
      : status === 429
        ? 'Udbyderens rate limit er nået. Prøv igen senere.'
        : 'Udbyderen kunne ikke gennemføre kaldet. Kontrollér model og endpoint.',
  );
}
export async function providerFetch(
  config: ProviderConnection,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
) {
  const base = validateEndpoint(
    config.id,
    config.endpoint || defaultEndpoint(config.id, config.region),
    config.region,
  );
  await publicDns(base);
  const token = await bearer(config);
  const response = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(config.id === 'azure' ? { 'api-key': token } : { Authorization: `Bearer ${token}` }),
      ...(config.id === 'corti' && config.authMode === 'oauth'
        ? { 'Tenant-Name': config.tenant || 'base' }
        : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: 'error',
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(55_000)])
      : AbortSignal.timeout(55_000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw providerError(response.status);
  }
  return response;
}
export function envConnection(id: ProviderId): ProviderConnection {
  const prefix = id === 'azure' ? 'KAIA_AZURE_OPENAI' : `KAIA_${id.toUpperCase()}`;
  const e = process.env;
  const rawRegion = e.KAIA_CORTI_REGION?.trim().toLowerCase() || 'eu';
  if (id === 'corti' && !['eu', 'us', 'fr'].includes(rawRegion))
    throw new ApiError(503, 'KAIA_CORTI_REGION skal være eu, us eller fr.');
  const region: CortiRegion | undefined = id === 'corti' ? (rawRegion as CortiRegion) : undefined;
  return {
    id,
    model: e[`${prefix}_MODEL`] || e[`${prefix}_DEPLOYMENT`] || '',
    endpoint: e[`${prefix}_ENDPOINT`] || defaultEndpoint(id, region),
    region,
    authMode: e.KAIA_CORTI_AUTH_MODE === 'oauth' ? 'oauth' : 'apiKey',
    tenant: e.KAIA_CORTI_TENANT || 'base',
    secrets: {
      apiKey: e[`${prefix}_API_KEY`],
      clientId: e[`${prefix}_CLIENT_ID`],
      clientSecret: e[`${prefix}_CLIENT_SECRET`],
    },
    status: 'Miljøkonfiguration · kræver forbindelsestest',
    tested: false,
  };
}
export function configured(p: ProviderConnection) {
  return (
    p.id === 'demo' ||
    !!(
      p.model &&
      (p.secrets.apiKey ||
        (p.id === 'corti' &&
          p.authMode === 'oauth' &&
          p.secrets.clientId &&
          p.secrets.clientSecret)) &&
      p.endpoint
    )
  );
}
export async function getProvider(id: ProviderId): Promise<ProviderConnection> {
  const env = envConnection(id);
  if (id === 'demo')
    return { ...env, model: 'Deterministisk analyse', status: 'Klar', tested: true };
  const [r] =
    await sql()`SELECT data,encrypted_secret FROM kaia_configuration WHERE key=${`provider:${id}`}`;
  const connection: ProviderConnection = r
    ? {
        ...env,
        ...r.data,
        secrets: {
          ...env.secrets,
          ...(r.encrypted_secret ? JSON.parse(decryptSecret(r.encrypted_secret)) : {}),
        },
      }
    : env;
  if (connection.tested && connection.testedFingerprint !== connectionFingerprint(connection))
    return { ...connection, tested: false, status: 'Forbindelsen er ændret · kræver ny test' };
  return connection;
}
export async function activeProvider() {
  const [r] = await sql()`SELECT data FROM kaia_configuration WHERE key='provider:active'`;
  const id = (r?.data?.id || process.env.KAIA_DEFAULT_PROVIDER || 'demo') as ProviderId;
  if (!IDS.includes(id)) throw new ApiError(503, 'Ukendt standardudbyder.');
  return getProvider(id);
}
export async function publicProviders(): Promise<ProviderPublic[]> {
  const active = (await activeProvider()).id;
  return Promise.all(
    IDS.map(async (id) => {
      const p = await getProvider(id);
      return {
        id,
        model: p.model,
        configured: configured(p),
        active: id === active,
        endpoint: p.endpoint,
        region: p.region,
        authMode: p.authMode,
        tenant: p.tenant,
        temperature: p.temperature,
        maxTokens: p.maxTokens,
        status: p.status || 'Ikke konfigureret',
      };
    }),
  );
}
export function connectionFingerprint(p: ProviderConnection) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        id: p.id,
        model: p.model,
        endpoint: p.endpoint,
        region: p.region || null,
        authMode: p.authMode || 'apiKey',
        tenant: p.tenant || 'base',
        temperature: p.temperature ?? null,
        maxTokens: p.maxTokens ?? null,
        secrets: {
          apiKey: p.secrets.apiKey || null,
          clientId: p.secrets.clientId || null,
          clientSecret: p.secrets.clientSecret || null,
        },
      }),
    )
    .digest('hex');
}
export function normalizeProviderUpdate(
  old: ProviderConnection,
  input: z.infer<typeof providerSchema>,
) {
  const { apiKey, clientId, clientSecret, active, temperature, maxTokens, ...config } = input;
  if (input.id !== 'demo' && !input.model)
    throw new ApiError(400, 'Angiv model eller Azure-deployment.');
  const region = input.region || old.region;
  const regionChanged = input.id === 'corti' && region !== old.region;
  const endpoint =
    input.id === 'demo'
      ? undefined
      : validateEndpoint(
          input.id,
          input.endpoint || (!regionChanged && old.endpoint) || defaultEndpoint(input.id, region),
          region,
        );
  const secrets = {
    ...old.secrets,
    ...(apiKey ? { apiKey } : {}),
    ...(clientId ? { clientId } : {}),
    ...(clientSecret ? { clientSecret } : {}),
  };
  const { secrets: _oldSecrets, ...oldConfig } = old;
  void _oldSecrets;
  const merged = {
    ...oldConfig,
    ...config,
    ...(temperature !== undefined
      ? { temperature: temperature === null ? undefined : temperature }
      : {}),
    ...(maxTokens !== undefined ? { maxTokens: maxTokens === null ? undefined : maxTokens } : {}),
    endpoint,
  };
  const fields: (keyof ProviderConfig)[] = [
    'id',
    'model',
    'endpoint',
    'region',
    'authMode',
    'tenant',
    'temperature',
    'maxTokens',
  ];
  const changed =
    fields.some((key) => merged[key] !== old[key]) || !!(apiKey || clientId || clientSecret);
  const tested = !changed && old.tested;
  const data = { ...merged, status: tested ? 'Forbindelse testet' : 'Ikke testet', tested };
  if (active && input.id !== 'demo' && !tested)
    throw new ApiError(400, 'Gem forbindelsen, test den, og aktivér den derefter.');
  return { data, secrets };
}
export async function saveProvider(input: z.infer<typeof providerSchema>) {
  const { data, secrets } = normalizeProviderUpdate(await getProvider(input.id), input);
  if (input.apiKey || input.clientId || input.clientSecret) oauthTokens.clear();
  if (input.id !== 'demo')
    await sql()`INSERT INTO kaia_configuration(key,data,encrypted_secret) VALUES(${`provider:${input.id}`},${sql().json(data)},${encryptSecret(JSON.stringify(secrets))}) ON CONFLICT(key) DO UPDATE SET data=excluded.data,encrypted_secret=excluded.encrypted_secret,updated_at=now()`;
  if (input.active)
    await sql()`INSERT INTO kaia_configuration(key,data) VALUES('provider:active',${sql().json({ id: input.id })}) ON CONFLICT(key) DO UPDATE SET data=excluded.data,updated_at=now()`;
}
export async function listModels(config: ProviderConnection) {
  if (config.id === 'demo') return [];
  if (config.id === 'azure') return [config.model];
  const response = await providerFetch(config, '/models');
  const body = await response.json();
  return z
    .object({ data: z.array(z.object({ id: z.string() })) })
    .parse(body)
    .data.slice(0, 150)
    .map((m) => m.id);
}
export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}
export interface ChatTool {
  type: 'function';
  function: { name: string; description: string; parameters: unknown };
}
export async function complete(
  config: ProviderConnection,
  messages: ChatMessage[],
  tools: ChatTool[],
  signal?: AbortSignal,
) {
  const response = await providerFetch(
    config,
    '/chat/completions',
    {
      model: config.model,
      messages,
      tools,
      tool_choice: 'auto',
      ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
      ...(config.id === 'openai' || config.id === 'azure'
        ? { max_completion_tokens: Math.min(config.maxTokens || 1600, 4096) }
        : { max_tokens: Math.min(config.maxTokens || 1600, 4096) }),
      stream: false,
    },
    signal,
  );
  const data = await response.json();
  const parsed = z
    .object({
      choices: z
        .array(
          z.object({
            message: z.object({
              content: z.string().nullable().optional(),
              tool_calls: z
                .array(
                  z.object({
                    id: z.string(),
                    type: z.literal('function'),
                    function: z.object({ name: z.string(), arguments: z.string() }),
                  }),
                )
                .max(4)
                .optional(),
            }),
          }),
        )
        .min(1),
    })
    .parse(data);
  return parsed.choices[0].message;
}
export async function* streamText(
  config: ProviderConnection,
  messages: ChatMessage[],
  signal?: AbortSignal,
) {
  const response = await providerFetch(
    config,
    '/chat/completions',
    {
      model: config.model,
      messages,
      stream: true,
      ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
      ...(config.id === 'openai' || config.id === 'azure'
        ? { max_completion_tokens: Math.min(config.maxTokens || 1600, 4096) }
        : { max_tokens: Math.min(config.maxTokens || 1600, 4096) }),
    },
    signal,
  );
  if (!response.body) throw new ApiError(502, 'Udbyderen returnerede ingen stream.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '',
    received = 0,
    done = false;
  try {
    while (!done) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      if (buffer.length > 1_000_000) throw new ApiError(502, 'Udbyderens stream var for stor.');
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const raw = line.slice(5).trim();
        if (raw === '[DONE]') {
          done = true;
          break;
        }
        if (!raw) continue;
        const obj = JSON.parse(raw);
        if (obj.error) throw new ApiError(502, 'Udbyderens stream blev afbrudt.');
        const text = obj.choices?.[0]?.delta?.content;
        if (typeof text === 'string') {
          received += text.length;
          if (received > 24000) throw new ApiError(502, 'Svaret overskrider længdegrænsen.');
          yield text;
        }
      }
    }
    if (!done) throw new ApiError(502, 'Udbyderens stream blev afbrudt. Prøv igen.');
  } finally {
    await reader.cancel().catch(() => {});
  }
}
export async function testProvider(id: ProviderId) {
  const config = await getProvider(id);
  if (id === 'demo')
    return {
      ok: true,
      message: 'Demo bruger serverberegninger uden eksterne modelkald.',
      models: [],
      capabilities: { streaming: false, tools: false },
    };
  const tool: ChatTool = {
    type: 'function',
    function: {
      name: 'connection_probe',
      description: 'Forbindelsestest. Kald dette værktøj med ping="kaia".',
      parameters: {
        type: 'object',
        properties: { ping: { type: 'string', enum: ['kaia'] } },
        required: ['ping'],
        additionalProperties: false,
      },
    },
  };
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'Dette er en forbindelsestest. Kald connection_probe præcis én gang, og svar derefter kort på dansk.',
    },
    { role: 'user', content: 'Test værktøjskaldet nu.' },
  ];
  const result = await complete(config, messages, [tool]);
  const call = result.tool_calls?.[0];
  if (
    !call ||
    call.function.name !== 'connection_probe' ||
    JSON.parse(call.function.arguments).ping !== 'kaia'
  )
    throw new ApiError(
      422,
      'Forbindelsen svarede, men værktøjsunderstøttelsen kunne ikke bekræftes for modellen.',
    );
  messages.push(
    { role: 'assistant', content: result.content || null, tool_calls: [call] },
    { role: 'tool', tool_call_id: call.id, content: '{"ok":true}' },
  );
  let answer = '';
  for await (const text of streamText(config, messages)) answer += text;
  if (!answer.trim()) throw new ApiError(422, 'Streaming returnerede ingen tekst.');
  const models = await listModels(config).catch(() => [config.model]);
  if (connectionFingerprint(await getProvider(id)) !== connectionFingerprint(config))
    throw new ApiError(409, 'Forbindelsen blev ændret under testen. Test den igen.');
  const { secrets: _, ...publicConfig } = config;
  void _;
  await sql()`INSERT INTO kaia_configuration(key,data) VALUES(${`provider:${id}`},${sql().json({ ...publicConfig, tested: true, testedFingerprint: connectionFingerprint(config), status: 'Forbindelse testet · streaming og værktøjer' })}) ON CONFLICT(key) DO UPDATE SET data=excluded.data,updated_at=now()`;
  return {
    ok: true,
    message: 'Forbindelse, værktøjskald og streaming er afprøvet med den valgte model.',
    models,
    capabilities: { streaming: true, tools: true },
  };
}
