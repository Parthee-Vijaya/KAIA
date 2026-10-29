import { describe, expect, it, vi } from 'vitest';
import type { AccessContext } from '../src/domain/types';
import { getDataset } from '../src/domain/data';
import { SOURCE_CATALOG, listAllowedCatalog } from '../src/integrations/catalog';
import { authorizeSource } from '../src/integrations/policy';
import { planQuery, authorizePlan } from '../src/integrations/planner';
import {
  FixtureLakeAdapter,
  ingestSnapshot,
  readRawSnapshot,
  readCuratedRows,
  snapshotHash,
  SnapshotConflict,
} from '../src/integrations/lake';
import {
  CliRunnerGateway,
  McpGateway,
  isPublicAddress,
  validateGatewayUrl,
} from '../src/integrations/gateways';
import {
  StatbankClient,
  parseStatbankCsv,
  statbankNumber,
  validateStatbankSelection,
} from '../src/integrations/statbank';
import { contextSeries } from '../src/integrations/context';
import { enrichAnalysisWithContext } from '../src/integrations/enrich-analysis';
import { analyze } from '../src/domain/analysis';
import snapshot from '../src/integrations/snapshots/statbank-2026-10-20.json';
import type { SourceRequest } from '../src/integrations/types';

const school = 'school-herredsaasen';
const otherSchool = 'school-nyrup';
const access: AccessContext = {
  userId: 'test-subject',
  tenantId: 'test-tenant',
  objectId: 'test-object',
  roles: ['KAIA.Finance'],
  unitIds: [school],
  areas: ['schools'],
  displayName: 'Økonomikonsulent',
  title: 'Økonomikonsulent',
};
const request: SourceRequest = {
  sourceId: 'demo-ledger',
  operation: 'aggregate',
  area: 'schools',
  unitIds: [school],
  period: { year: 2026, fromMonth: 1, toMonth: 9 },
};
const admin: AccessContext = { ...access, roles: ['KAIA.Admin'], unitIds: [school, otherSchool] };
const ingestRequest: SourceRequest = {
  ...request,
  operation: 'ingest',
  unitIds: [school, otherSchool],
};
const input = {
  sourceId: 'demo-ledger',
  datasetVersion: 'test-v1',
  observedAt: '2026-09-30T00:00:00Z',
  retrievedAt: '2026-10-20T00:00:00Z',
  schemaVersion: '1',
  rawPayload: { status: 'simulated', amountOre: 12345 },
  rows: [
    {
      key: 'DEMO-ROW-1',
      entityId: school,
      period: '2026-09',
      values: { amountOre: 12345, kind: 'actual' },
    },
    {
      key: 'DEMO-ROW-2',
      entityId: otherSchool,
      period: '2026-09',
      values: { amountOre: 24567, kind: 'actual' },
    },
  ],
};

describe('source catalog, routing and access policy', () => {
  it('never lists source access for an unassigned identity', () =>
    expect(listAllowedCatalog({ ...access, roles: [] })).toEqual([]));
  it('limits advertised scope and operations to the server identity', () => {
    const catalog = listAllowedCatalog(access);
    expect(catalog.length).toBe(SOURCE_CATALOG.length);
    expect(
      catalog.every(
        (source) =>
          source.unitIds.length === 1 &&
          source.unitIds[0] === school &&
          !source.operations.includes('ingest'),
      ),
    ).toBe(true);
  });
  it('uses canonical wildcard and committee scope rules', () => {
    expect(authorizeSource({ ...access, unitIds: ['*'] }, request).id).toBe('demo-ledger');
    expect(
      authorizeSource(
        { ...access, roles: ['KAIA.Council'], unitIds: ['committee-boern-familie'] },
        request,
      ).id,
    ).toBe('demo-ledger');
  });
  it('rejects an injected source, unit, area, period and write operation', () => {
    for (const modified of [
      { sourceId: 'secret-source' },
      { unitIds: [otherSchool] },
      { area: 'social' as const },
      { period: { year: 2019, fromMonth: 1, toMonth: 9 } },
      { period: { year: 2033, fromMonth: 1, toMonth: 9 } },
      { operation: 'ingest' as const },
    ])
      expect(() => authorizeSource(access, { ...request, ...modified })).toThrow();
    expect(() =>
      authorizeSource(access, { ...request, period: { year: 2026, fromMonth: 9, toMonth: 1 } }),
    ).toThrow();
  });
  it('council receives aggregate access and cannot request posting detail', () =>
    expect(() =>
      authorizeSource({ ...access, roles: ['KAIA.Council'] }, { ...request, operation: 'detail' }),
    ).toThrow(/aggregerede/));
  it('routes explanation questions through deterministic approved sources', () => {
    const plan = planQuery(
      'Forklar energiudgifter og den simulerede beslutning',
      { area: 'schools', entityIds: [school], period: request.period },
      access,
    );
    expect(plan.steps.map((step) => step.sourceId)).toEqual([
      'demo-ledger',
      'demo-documents',
      'energy-price-context',
    ]);
    expect(() =>
      authorizePlan(
        {
          ...plan,
          steps: [...plan.steps, { ...request, sourceId: 'secret', reason: 'model invented' }],
        },
        access,
      ),
    ).toThrow();
  });
});

describe('versioned raw and curated lake fixture contract', () => {
  it('is idempotent and keeps a changed version from silently changing evidence', async () => {
    const lake = new FixtureLakeAdapter();
    expect((await ingestSnapshot(input, admin, ingestRequest, lake)).result).toBe('inserted');
    expect((await ingestSnapshot(input, admin, ingestRequest, lake)).result).toBe('unchanged');
    await expect(
      ingestSnapshot({ ...input, rawPayload: { amountOre: 999 } }, admin, ingestRequest, lake),
    ).rejects.toBeInstanceOf(SnapshotConflict);
    await expect(
      ingestSnapshot({ ...input, observedAt: '2026-09-29T00:00:00Z' }, admin, ingestRequest, lake),
    ).rejects.toBeInstanceOf(SnapshotConflict);
  });
  it('keeps an earlier version intact when a new version is imported', async () => {
    const lake = new FixtureLakeAdapter();
    await ingestSnapshot(input, admin, ingestRequest, lake);
    await ingestSnapshot(
      { ...input, datasetVersion: 'test-v2', rawPayload: { amountOre: 999 } },
      admin,
      ingestRequest,
      lake,
    );
    expect((await lake.get('demo-ledger', 'test-v1', input.observedAt))?.rawPayload).toEqual(
      input.rawPayload,
    );
  });
  it('filters curated rows before returning and blocks a mixed-scope raw export', async () => {
    const lake = new FixtureLakeAdapter();
    await ingestSnapshot(input, admin, ingestRequest, lake);
    expect((await readCuratedRows(lake, access, request, 'test-v1')).map((row) => row.key)).toEqual(
      ['DEMO-ROW-1'],
    );
    await expect(
      readRawSnapshot(lake, access, request, 'test-v1', input.observedAt),
    ).rejects.toThrow(/Rå snapshot/);
    await expect(
      readCuratedRows(lake, access, { ...request, unitIds: [otherSchool] }, 'test-v1'),
    ).rejects.toThrow();
  });
  it('validates missing rows, duplicate keys, non-finite values, foreign units and periods', async () => {
    const lake = new FixtureLakeAdapter();
    for (const bad of [
      { ...input, rows: [] },
      { ...input, rows: [input.rows[0], input.rows[0]] },
      { ...input, rows: [{ ...input.rows[0], values: { amountOre: Infinity } }] },
      { ...input, rows: [{ ...input.rows[0], entityId: 'school-unknown' }] },
      { ...input, rows: [{ ...input.rows[0], period: '2025-09' }] },
    ])
      await expect(ingestSnapshot(bad, admin, ingestRequest, lake)).rejects.toThrow();
  });
  it('hashes object keys canonically', () =>
    expect(snapshotHash({ b: 2, a: 1 })).toBe(snapshotHash({ a: 1, b: 2 })));
});

describe('MCP and remote CLI gateway contracts, fixtures rather than municipal integrations', () => {
  const mcpRequest: SourceRequest = { ...request, sourceId: 'mcp-fixture', operation: 'tool' };
  const cliRequest: SourceRequest = { ...request, sourceId: 'cli-fixture', operation: 'tool' };
  const config = {
    url: 'https://integrations.example.com/mcp',
    allowedHost: 'integrations.example.com',
    token: 'fixture-secret',
  };
  it('exercises local fixtures and records scope without external calls', async () => {
    const audit = vi.fn();
    const gateway = new McpGateway(undefined, audit);
    expect(
      (await gateway.catalogLookup({ sourceId: 'demo-ledger', year: 2026 }, access, mcpRequest))
        .description,
    ).toContain('kontraktfixture');
    expect(audit.mock.calls[0][0]).toMatchObject({ outcome: 'ok', operation: 'catalog_lookup' });
    expect(JSON.stringify(audit.mock.calls)).not.toContain('fixture-secret');
    expect(
      (
        await new CliRunnerGateway().snapshotStatus(
          'snapshot_status',
          { sourceId: 'demo-ledger', datasetVersion: 'v1' },
          access,
          cliRequest,
        )
      ).fixture,
    ).toBe(true);
  });
  it('rejects shell, unknown arguments and operations outside the identity scope', async () => {
    const runner = new CliRunnerGateway();
    await expect(runner.snapshotStatus('sh -c whoami', {}, access, cliRequest)).rejects.toThrow(
      /ikke tilladt/,
    );
    await expect(
      runner.snapshotStatus(
        'snapshot_status',
        { sourceId: 'demo-ledger', datasetVersion: 'v1', shell: 'whoami' },
        access,
        cliRequest,
      ),
    ).rejects.toThrow();
    await expect(
      new McpGateway().catalogLookup({ sourceId: 'demo-ledger', year: 2026 }, access, {
        ...mcpRequest,
        unitIds: [otherSchool],
      }),
    ).rejects.toThrow();
  });
  it('implements initialize, initialized, tools/list and tools/call with validated output', async () => {
    const methods: string[] = [];
    const headers: Headers[] = [];
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      methods.push(body.method);
      headers.push(new Headers(init?.headers));
      if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
      const result =
        body.method === 'initialize'
          ? { protocolVersion: '2025-06-18', capabilities: { tools: {} } }
          : body.method === 'tools/list'
            ? { tools: [{ name: 'catalog_lookup', annotations: { readOnlyHint: true } }] }
            : {
                structuredContent: {
                  sourceId: 'demo-ledger',
                  year: 2026,
                  status: 'simulated',
                  entityIds: [school],
                  description: 'Testfixture, ikke kommunal integration.',
                },
              };
      return Response.json(
        { jsonrpc: '2.0', id: body.id, result },
        { headers: { 'mcp-session-id': 'fixture-session' } },
      );
    }) as typeof fetch;
    const result = await new McpGateway(config, undefined, fetcher, async () => {}).catalogLookup(
      { sourceId: 'demo-ledger', year: 2026 },
      access,
      mcpRequest,
    );
    expect(result.entityIds).toEqual([school]);
    expect(methods).toEqual([
      'initialize',
      'notifications/initialized',
      'tools/list',
      'tools/call',
    ]);
    expect(headers[3].get('mcp-session-id')).toBe('fixture-session');
    expect(JSON.stringify(result)).not.toContain('fixture-secret');
  });
  it('blocks local, metadata-service, private IPv4/IPv6, credentials and mismatched hosts', () => {
    for (const host of [
      '127.0.0.1',
      '10.1.2.3',
      '169.254.169.254',
      '192.168.0.1',
      'localhost',
      '[::1]',
      '[fc00::1]',
      '[::ffff:7f00:1]',
    ])
      expect(() =>
        validateGatewayUrl({
          ...config,
          url: `https://${host}/mcp`,
          allowedHost: host.replace(/^\[|\]$/g, ''),
        }),
      ).toThrow();
    expect(() =>
      validateGatewayUrl({ ...config, url: 'https://user:pass@integrations.example.com/mcp' }),
    ).toThrow();
    expect(() => validateGatewayUrl({ ...config, url: 'https://attacker.example/mcp' })).toThrow();
    expect(isPublicAddress('8.8.8.8')).toBe(true);
    expect(isPublicAddress('::ffff:127.0.0.1')).toBe(false);
  });
});

describe('Statistikbanken metadata contracts and verified public snapshot', () => {
  it('snapshot checksum and numeric observation count match the persisted public extract', () => {
    const { contentHash, ...payload } = snapshot;
    expect(snapshotHash(payload)).toBe(contentHash);
    expect(
      Object.values(snapshot.extracts).reduce((sum, extract) => sum + extract.rows.length, 0),
    ).toBe(18);
    expect(JSON.stringify(snapshot)).not.toMatch(/"contacts"|"phone"|"mail"/);
    expect(snapshot.extracts.prices.metadata.id).toBe('PRIS01');
  });
  it('rejects guessed dimensions, values, missing variables and wildcards', () => {
    const metadata = { ...snapshot.extracts.prices.metadata, id: 'PRIS01' as const };
    const valid = snapshot.extracts.prices.request.variables;
    expect(validateStatbankSelection(metadata, valid)).toEqual(valid);
    for (const bad of [
      valid.slice(1),
      [{ code: 'guessed', values: ['100'] }, ...valid.slice(1)],
      [{ ...valid[0], values: ['*'] }, ...valid.slice(1)],
    ])
      expect(() => validateStatbankSelection(metadata, bad)).toThrow();
  });
  it('parses Danish decimals and quoted CSV, preserves missing values explicitly', () => {
    expect(parseStatbankCsv('TID;INDHOLD\r\n"2026M09";"80,08"\r\n')[0].TID).toBe('2026M09');
    expect(statbankNumber('80,08')).toBe(80.08);
    expect(statbankNumber('..')).toBeNull();
    expect(() => statbankNumber('NaN')).toThrow();
    expect(() => parseStatbankCsv('TID;INDHOLD\n2026M09\n')).toThrow();
  });
  it('fetches metadata before data, strips contacts and enforces the selected observations', async () => {
    const calls: string[] = [];
    const extract = snapshot.extracts.prices;
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      calls.push(String(url));
      return calls.length === 1
        ? Response.json({ ...extract.metadata, contacts: [{ name: 'must be discarded' }] })
        : new Response(extract.rawCsv);
    }) as typeof fetch;
    const result = await new StatbankClient(fetcher).extract('PRIS01', extract.request.variables);
    expect(calls).toEqual([
      'https://api.statbank.dk/v1/tableinfo',
      'https://api.statbank.dk/v1/data',
    ]);
    expect(result.rows).toHaveLength(4);
    expect(JSON.stringify(result.metadata)).not.toContain('must be discarded');
  });
  it('uses the same simulated dataset for energy and demography context, with explicit public opt-in', () => {
    const dataset = getDataset();
    const series = contextSeries(
      access,
      { ...request, period: { ...request.period, year: 2023 }, sourceId: 'energy-price-context' },
      dataset.version,
    );
    expect(series[0].observations[0].value).toBe(100);
    expect(series[0].status).toBe('simulated');
    const publicSeries = contextSeries(
      access,
      { ...request, sourceId: 'dst-prices' },
      dataset.version,
    );
    expect(publicSeries[0].status).toBe('verified-public-snapshot');
    expect(publicSeries[0].geography).toBe('Danmark');
    expect(() =>
      contextSeries(access, { ...request, sourceId: 'energy-price-context' }, 'other-version'),
    ).toThrow(/samme dataversion/);
  });
  it('executes context plan and persists its status, observations and source with the analysis', () => {
    const dataset = getDataset();
    const basis = analyze(
      'Forklar energiudgifternes ændring med pris, mængde og samspil.',
      access,
      undefined,
      undefined,
      dataset,
    );
    const result = enrichAnalysisWithContext(
      basis,
      access,
      planQuery(basis.question, basis.context, access),
      dataset,
    );
    expect(result.contextSeries).toHaveLength(1);
    expect(result.contextSeries![0].observations.map((row) => row.period)).toEqual([
      '2025',
      '2026',
    ]);
    const source = result.sources.find((item) => item.type === 'context')!;
    expect(source.status).toBe('simulated');
    expect(source.excerpt).toContain('2026');
    expect(result.narrative.at(-1)).toContain('ikke i sig selv belæg');
    expect(result.metrics).toEqual(basis.metrics);
    expect(result.chart).toEqual(basis.chart);
    expect(
      enrichAnalysisWithContext(
        result,
        access,
        planQuery(basis.question, basis.context, access),
        dataset,
      ).sources,
    ).toHaveLength(result.sources.length);
  });
  it('retains local economics and explains missing optional public coverage', () => {
    vi.stubEnv('KAIA_CONTEXT_MODE', 'public-snapshot');
    try {
      const dataset = getDataset();
      const basis = analyze('Vis energiudgifter i 2024.', access, undefined, undefined, dataset);
      const plan = planQuery(basis.question, basis.context, access);
      const result = enrichAnalysisWithContext(basis, access, plan, dataset);
      expect(result.contextSeries).toEqual([]);
      expect(result.metrics).toEqual(basis.metrics);
      expect(result.assumptions.join(' ')).toContain('ikke tilgængelig');
      expect(result.sources.some((source) => source.type === 'context')).toBe(false);
      expect(() =>
        planQuery(basis.question, { ...basis.context, entityIds: [otherSchool] }, access),
      ).toThrow();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
