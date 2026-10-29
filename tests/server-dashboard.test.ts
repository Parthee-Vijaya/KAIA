import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CATEGORIES, type Dataset } from '../src/domain/data';
import {
  DEFAULT_SCENARIO,
  type AccessContext,
  type Entity,
  type LedgerRow,
} from '../src/domain/types';
import { ApiError } from '../src/server/errors';
import type {
  DashboardData,
  DashboardScenarioInput,
  DashboardScope,
} from '../src/domain/dashboard';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  loadDatasetShell: vi.fn(),
  loadDashboardDataset: vi.fn(),
  consumePreviewBudget: vi.fn(),
  consumeAnalysisBudget: vi.fn(),
  saveAnalysis: vi.fn(),
  saveScenario: vi.fn(),
  activeProvider: vi.fn(),
}));
vi.mock('@/server/auth', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/server/repository', () => ({
  loadDatasetShell: mocks.loadDatasetShell,
  loadDashboardDataset: mocks.loadDashboardDataset,
  consumePreviewBudget: mocks.consumePreviewBudget,
  consumeAnalysisBudget: mocks.consumeAnalysisBudget,
  saveAnalysis: mocks.saveAnalysis,
  saveScenario: mocks.saveScenario,
}));
vi.mock('@/server/providers', () => ({ activeProvider: mocks.activeProvider }));
vi.mock('@/server/db', () => {
  throw new Error('Dashboard contract tests must not access a database.');
});

import { GET } from '../src/app/api/dashboard/route';
import { POST } from '../src/app/api/dashboard/scenario/route';

const origin = 'http://127.0.0.1:3210';
const currentVersion = 'KAIA-HTTP-FIXTURE-v2';
const oldVersion = 'KAIA-HTTP-FIXTURE-v1';
const finance: AccessContext = {
  userId: 'http-fixture',
  tenantId: 'fixture-tenant',
  objectId: 'fixture-object',
  roles: ['KAIA.Finance'],
  areas: ['schools', 'facilities'],
  unitIds: ['*'],
  displayName: 'Økonomikonsulent',
  title: 'Økonomikonsulent',
};

function fixture(version: string, toYear = 2032): Dataset {
  const entities: Entity[] = [
    {
      id: 'school-hoeng',
      name: 'Høng Skole',
      type: 'school',
      area: 'schools',
      aliases: [],
      nameSourceUrl: 'https://www.kalundborg.dk/',
      verifiedAt: '2026-10-21',
      synthetic: { annualBudgetOre: 1000000, pupils: 100 },
    },
    {
      id: 'school-sveboelle',
      name: 'Svebølle Skole',
      type: 'school',
      area: 'schools',
      aliases: [],
      nameSourceUrl: 'https://www.kalundborg.dk/',
      verifiedAt: '2026-10-21',
      synthetic: { annualBudgetOre: 2000000, pupils: 200 },
    },
    {
      id: 'facility-spiralen',
      name: 'Spiralen',
      type: 'facility',
      area: 'facilities',
      aliases: [],
      nameSourceUrl: 'https://www.kalundborg.dk/',
      verifiedAt: '2026-10-21',
      synthetic: { annualBudgetOre: 3000000 },
    },
    {
      id: 'committee-schools',
      name: 'Børn- og Familieudvalget',
      type: 'committee',
      area: 'schools',
      aliases: [],
      nameSourceUrl: 'https://www.kalundborg.dk/',
      verifiedAt: '2026-10-21',
      synthetic: { annualBudgetOre: 0 },
    },
  ];
  const rows: LedgerRow[] = [];
  for (const [index, entity] of entities.filter((entity) => entity.type !== 'committee').entries())
    for (let year = 2025; year <= toYear; year++)
      for (let month = 1; month <= 12; month++)
        for (const [categoryIndex, category] of CATEGORIES.entries())
          for (const kind of ['budget', 'actual', 'forecast'] as const) {
            if (kind === 'actual' && (year > 2026 || (year === 2026 && month > 9))) continue;
            let amountOre =
              10000 * (index + 1) +
              month * 11 +
              categoryIndex * 3 +
              (year - 2025) * 109 +
              (kind === 'budget' ? 0 : kind === 'actual' ? 47 : 83);
            if (
              version === currentVersion &&
              kind === 'actual' &&
              year === 2026 &&
              category === 'salary'
            )
              amountOre += 1234;
            if (category === 'income') amountOre = -Math.round(amountOre / 10);
            rows.push({
              id: `DEMO-L-${entity.id}-${year}-${month}-${category}-${kind}`,
              datasetVersion: version,
              entityId: entity.id,
              year,
              month,
              kind,
              category,
              amountOre,
            });
          }
  return {
    version,
    seed: 'http-fixture',
    referenceDate: '2026-09-30',
    coverage: { fromYear: 2025, toYear },
    entities,
    rows,
    documents: [],
  };
}
const datasets = new Map([
  [currentVersion, fixture(currentVersion)],
  [oldVersion, fixture(oldVersion, 2028)],
]);

function get(query = ''): Promise<Response> {
  return GET(new Request(`${origin}/api/dashboard${query ? `?${query}` : ''}`));
}
function scenario(overrides: Partial<DashboardScenarioInput> = {}): DashboardScenarioInput {
  return {
    context: {
      area: 'schools',
      entityIds: ['school-hoeng', 'school-sveboelle'],
      period: { year: 2026, fromMonth: 1, toMonth: 9 },
    },
    datasetVersion: currentVersion,
    assumptions: { ...DEFAULT_SCENARIO, energyPercent: 15 },
    ...overrides,
  };
}
function post(input: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return POST(
    new Request(`${origin}/api/dashboard/scenario`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json', ...headers },
      body: typeof input === 'string' ? input : JSON.stringify(input),
    }),
  );
}
function baselineTotal(data: Dataset, ids: string[]): number {
  return data.rows
    .filter(
      (row) =>
        ids.includes(row.entityId) &&
        row.year === 2026 &&
        row.kind === (row.month <= 9 ? 'actual' : 'forecast'),
    )
    .reduce((sum, row) => sum + row.amountOre, 0);
}
function assertNoModelOrPersistence() {
  expect(mocks.activeProvider).not.toHaveBeenCalled();
  expect(mocks.consumeAnalysisBudget).not.toHaveBeenCalled();
  expect(mocks.saveAnalysis).not.toHaveBeenCalled();
  expect(mocks.saveScenario).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('KAIA_APP_URL', origin);
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('No network in dashboard contract tests.'))),
  );
  mocks.requireUser.mockResolvedValue(finance);
  mocks.consumePreviewBudget.mockResolvedValue(undefined);
  mocks.loadDatasetShell.mockImplementation(
    async (_access: AccessContext, version = currentVersion) => {
      const data = datasets.get(version);
      if (!data) throw new ApiError(503, 'Datasættet er ikke indlæst. Kør migration og seed.');
      return { ...data, rows: [], documents: [] };
    },
  );
  mocks.loadDashboardDataset.mockImplementation(
    async (_access: AccessContext, scope: DashboardScope, shell: Dataset) => {
      const data = datasets.get(shell.version)!;
      return { ...data, rows: data.rows.filter((row) => scope.entityIds.includes(row.entityId)) };
    },
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('GET /api/dashboard uses server identity and read-only private responses', () => {
  it('returns all typed panels from one scoped load and never invokes a model or persistence', async () => {
    const response = await get('area=schools&year=2026&fromMonth=4&toMonth=6');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const result = (await response.json()) as DashboardData;
    expect(result.dataset.version).toBe(currentVersion);
    expect(result.scope).toEqual({
      area: 'schools',
      entityIds: ['school-hoeng', 'school-sveboelle'],
      period: { year: 2026, fromMonth: 4, toMonth: 6 },
    });
    expect(Object.keys(result.panels).sort()).toEqual([
      'budget',
      'comparison',
      'forecast',
      'heatmap',
      'peer',
      'perPupil',
      'waterfall',
      'year',
    ]);
    expect(result.suggestions).toHaveLength(4);
    expect(mocks.loadDatasetShell).toHaveBeenCalledExactlyOnceWith(finance, undefined);
    expect(mocks.loadDashboardDataset).toHaveBeenCalledTimes(1);
    expect(mocks.loadDashboardDataset.mock.calls[0].slice(0, 2)).toEqual([finance, result.scope]);
    expect(mocks.consumePreviewBudget).toHaveBeenCalledExactlyOnceWith(finance);
    expect(JSON.stringify(result)).not.toMatch(
      /tenantId|objectId|apiKey|clientSecret|"rows":\[\{"id":"DEMO-L/,
    );
    assertNoModelOrPersistence();
  });
  it('requires a validated session before reading metadata or consuming quota', async () => {
    mocks.requireUser.mockRejectedValue(new ApiError(401, 'Log ind for at fortsætte.'));
    const response = await get();
    expect(response.status).toBe(401);
    expect(mocks.loadDatasetShell).not.toHaveBeenCalled();
    expect(mocks.loadDashboardDataset).not.toHaveBeenCalled();
    expect(mocks.consumePreviewBudget).not.toHaveBeenCalled();
    assertNoModelOrPersistence();
  });
  it.each([
    'roles=KAIA.Admin',
    'userId=someone-else',
    'scope=*',
    'area=schools&area=facilities',
    'year=2026&year=2025',
    'year=',
    'year=2026.5',
    'year=2033',
    'fromMonth=10&toMonth=9',
    'datasetVersion=../../private',
    `datasetVersion=${'x'.repeat(101)}`,
    `entityId=${'x'.repeat(101)}`,
    Array.from({ length: 101 }, (_, i) => `entityId=school-${i}`).join('&'),
  ])('rejects invalid or authority-bearing query %s before any data load', async (query) => {
    const response = await get(query);
    expect(response.status).toBe(400);
    expect(mocks.loadDatasetShell).not.toHaveBeenCalled();
    expect(mocks.loadDashboardDataset).not.toHaveBeenCalled();
    expect(mocks.consumePreviewBudget).not.toHaveBeenCalled();
  });
  it.each([
    'area=facilities',
    'entityId=school-sveboelle',
    'entityId=unknown',
    'entityId=facility-spiralen',
  ])('denies a partial grant requesting %s before ledger load', async (query) => {
    mocks.requireUser.mockResolvedValue({
      ...finance,
      roles: ['KAIA.DepartmentHead'],
      areas: ['schools'],
      unitIds: ['school-hoeng'],
    });
    const response = await get(query);
    expect(response.status).toBe(403);
    expect(mocks.loadDashboardDataset).not.toHaveBeenCalled();
  });
  it('reduces every returned analysis to a partial grant and never fabricates a municipal peer', async () => {
    mocks.requireUser.mockResolvedValue({
      ...finance,
      roles: ['KAIA.DepartmentHead'],
      areas: ['schools'],
      unitIds: ['school-hoeng'],
    });
    const response = await get();
    expect(response.status).toBe(200);
    const result = (await response.json()) as DashboardData;
    expect(result.scope.entityIds).toEqual(['school-hoeng']);
    expect(result.capabilities.municipalBenchmark).toBe(false);
    expect(result.panels.peer.status).toBe('unsupported');
    for (const panel of Object.values(result.panels))
      if (panel.status === 'ready') {
        expect(panel.analysis.context.entityIds).toEqual(['school-hoeng']);
        expect(JSON.stringify(panel.analysis)).not.toContain('school-sveboelle');
      }
  });
  it('keeps Council aggregates available while denying detailed unit drilldown at HTTP level', async () => {
    mocks.requireUser.mockResolvedValue({
      ...finance,
      roles: ['KAIA.Council'],
      areas: ['schools'],
      unitIds: ['committee-schools'],
    });
    const response = await get();
    expect(response.status).toBe(200);
    const result = (await response.json()) as DashboardData;
    expect(result.capabilities.detail).toBe(false);
    expect(result.panels.heatmap.status).toBe('unsupported');
    expect(result.panels.comparison.status).toBe('unsupported');
    for (const panel of Object.values(result.panels))
      if (panel.status === 'ready')
        expect(panel.analysis.sources.every((source) => !source.rowIds?.length)).toBe(true);
    mocks.loadDashboardDataset.mockClear();
    expect((await get('entityId=school-hoeng')).status).toBe(403);
    expect(mocks.loadDashboardDataset).not.toHaveBeenCalled();
  });
  it('honors an explicitly requested historical snapshot and reports its unavailable future coverage', async () => {
    const oldResponse = await get(`datasetVersion=${oldVersion}`),
      currentResponse = await get(`datasetVersion=${currentVersion}`);
    const old = (await oldResponse.json()) as DashboardData,
      current = (await currentResponse.json()) as DashboardData;
    expect(oldResponse.status).toBe(200);
    expect(currentResponse.status).toBe(200);
    expect(old.dataset.version).toBe(oldVersion);
    expect(old.panels.forecast.status).toBe('missing');
    expect(current.panels.forecast.status).toBe('ready');
    expect(old.panels.budget.status).toBe('ready');
    expect(current.panels.budget.status).toBe('ready');
    if (old.panels.budget.status === 'ready' && current.panels.budget.status === 'ready') {
      expect(current.panels.budget.analysis.metrics[1].value).not.toBe(
        old.panels.budget.analysis.metrics[1].value,
      );
      expect(
        old.panels.budget.analysis.sources.every((source) => source.datasetVersion === oldVersion),
      ).toBe(true);
    }
    expect(mocks.loadDatasetShell.mock.calls.map((call) => call[1])).toEqual([
      oldVersion,
      currentVersion,
    ]);
    expect(
      mocks.loadDashboardDataset.mock.calls.map((call) => (call[2] as Dataset).version),
    ).toEqual([oldVersion, currentVersion]);
  });
  it('does not silently substitute the default snapshot when a requested version is absent', async () => {
    const response = await get('datasetVersion=KAIA-MISSING');
    expect(response.status).toBe(503);
    expect(mocks.loadDashboardDataset).not.toHaveBeenCalled();
  });
  it('applies preview rate limits before loading dataset metadata', async () => {
    mocks.consumePreviewBudget.mockRejectedValue(new ApiError(429, 'Prøv igen om lidt.'));
    const response = await get();
    expect(response.status).toBe(429);
    expect(mocks.loadDatasetShell).not.toHaveBeenCalled();
  });
});

describe('POST /api/dashboard/scenario validates access, origin and immutable version', () => {
  it('recomputes a transient scenario from the posted snapshot without changing its baseline or saving anything', async () => {
    const input = scenario(),
      data = datasets.get(currentVersion)!,
      before = JSON.stringify(data),
      response = await post(input);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const result = await response.json();
    const expectedDelta = data.rows
      .filter(
        (row) =>
          input.context.entityIds.includes(row.entityId) &&
          row.year === 2026 &&
          row.month > 9 &&
          row.kind === 'forecast' &&
          row.category === 'energy',
      )
      .reduce((sum, row) => sum + Math.round(row.amountOre * 0.15), 0);
    expect(result.analysis.datasetVersion).toBe(currentVersion);
    expect(result.analysis.conversationId).toBeUndefined();
    expect(result.analysis.scenario.baselineOre).toBe(baselineTotal(data, input.context.entityIds));
    expect(result.analysis.scenario.deltaOre).toBe(expectedDelta);
    expect(result.analysis.scenario.scenarioOre - result.analysis.scenario.baselineOre).toBe(
      expectedDelta,
    );
    expect(JSON.stringify(data)).toBe(before);
    expect(mocks.loadDashboardDataset).toHaveBeenCalledTimes(1);
    expect(mocks.loadDashboardDataset.mock.calls[0][3]).toEqual({ includeForecast: false });
    assertNoModelOrPersistence();
    const reset = await (await post(scenario({ assumptions: DEFAULT_SCENARIO }))).json();
    expect(reset.analysis.scenario.deltaOre).toBe(0);
    expect(reset.analysis.scenario.baselineOre).toBe(result.analysis.scenario.baselineOre);
  });
  it('keeps posted historical snapshot values isolated from newer data', async () => {
    const old = await (await post(scenario({ datasetVersion: oldVersion }))).json(),
      current = await (await post(scenario())).json();
    expect(old.analysis.datasetVersion).toBe(oldVersion);
    expect(current.analysis.datasetVersion).toBe(currentVersion);
    expect(old.analysis.scenario.baselineOre).toBe(
      baselineTotal(datasets.get(oldVersion)!, scenario().context.entityIds),
    );
    expect(current.analysis.scenario.baselineOre).not.toBe(old.analysis.scenario.baselineOre);
    expect(
      old.analysis.sources.every(
        (source: { datasetVersion: string }) => source.datasetVersion === oldVersion,
      ),
    ).toBe(true);
  });
  it('rejects an unauthenticated request before parsing input or consuming quota', async () => {
    mocks.requireUser.mockRejectedValue(new ApiError(401, 'Log ind.'));
    expect((await post('not-json')).status).toBe(401);
    expect(mocks.consumePreviewBudget).not.toHaveBeenCalled();
    expect(mocks.loadDatasetShell).not.toHaveBeenCalled();
  });
  it.each([undefined, 'https://attacker.example', 'http://127.0.0.1:3211'])(
    'rejects a missing or foreign Origin %s with no data or quota side effect',
    async (badOrigin) => {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (badOrigin) headers.origin = badOrigin;
      const response = await POST(
        new Request(`${origin}/api/dashboard/scenario`, {
          method: 'POST',
          headers,
          body: JSON.stringify(scenario()),
        }),
      );
      expect(response.status).toBe(403);
      expect(mocks.consumePreviewBudget).not.toHaveBeenCalled();
      expect(mocks.loadDatasetShell).not.toHaveBeenCalled();
      expect(mocks.loadDashboardDataset).not.toHaveBeenCalled();
    },
  );
  it.each([
    { userId: 'someone-else' },
    { roles: ['KAIA.Admin'] },
    { scope: '*' },
    { datasetVersion: '../../private' },
    { datasetVersion: 'x'.repeat(101) },
    { context: { ...scenario().context, role: 'KAIA.Admin' } },
    { context: { ...scenario().context, entityIds: [] } },
    { context: { ...scenario().context, period: { year: 2026, fromMonth: 10, toMonth: 9 } } },
    { assumptions: { ...DEFAULT_SCENARIO, energyPercent: 201 } },
    { assumptions: { ...DEFAULT_SCENARIO, shell: 'arbitrary' } },
  ])(
    'rejects invalid fields and client-supplied authority %j before loading data',
    async (patch) => {
      const response = await post({ ...scenario(), ...patch });
      expect(response.status).toBe(400);
      expect(mocks.consumePreviewBudget).not.toHaveBeenCalled();
      expect(mocks.loadDatasetShell).not.toHaveBeenCalled();
      expect(mocks.loadDashboardDataset).not.toHaveBeenCalled();
    },
  );
  it('rejects malformed JSON, an oversized body/header and a non-JSON content type', async () => {
    expect((await post('not-json')).status).toBe(400);
    expect((await post(' '.repeat(24001))).status).toBe(413);
    expect((await post(scenario(), { 'content-length': '24001' })).status).toBe(413);
    expect((await post(scenario(), { 'content-type': 'text/plain' })).status).toBe(415);
    expect(mocks.consumePreviewBudget).not.toHaveBeenCalled();
    expect(mocks.loadDashboardDataset).not.toHaveBeenCalled();
  });
  it('rechecks unit and area scope for scenarios even when the caller has a legitimate session', async () => {
    mocks.requireUser.mockResolvedValue({
      ...finance,
      roles: ['KAIA.DepartmentHead'],
      areas: ['schools'],
      unitIds: ['school-hoeng'],
    });
    expect((await post(scenario())).status).toBe(403);
    expect(
      (
        await post(
          scenario({
            context: {
              area: 'facilities',
              entityIds: ['facility-spiralen'],
              period: { year: 2026, fromMonth: 1, toMonth: 9 },
            },
          }),
        )
      ).status,
    ).toBe(403);
    expect(mocks.loadDashboardDataset).not.toHaveBeenCalled();
  });
  it('returns a clear 422 for historical remaining effects, then permits explicit annual sensitivity', async () => {
    const historical = scenario({
      context: { ...scenario().context, period: { year: 2025, fromMonth: 1, toMonth: 9 } },
    });
    const response = await post(historical);
    expect(response.status).toBe(422);
    expect((await response.json()).error).toMatch(/ingen resterende prognosemåneder|historisk/i);
    expect(mocks.loadDashboardDataset).not.toHaveBeenCalled();
    const annual = await post({
      ...historical,
      assumptions: { ...historical.assumptions, horizon: 'annual' },
    });
    expect(annual.status).toBe(200);
  });
  it('denies Council unit-specific scenarios but allows an aggregate one without row IDs', async () => {
    mocks.requireUser.mockResolvedValue({
      ...finance,
      roles: ['KAIA.Council'],
      areas: ['schools'],
      unitIds: ['committee-schools'],
    });
    const response = await post(scenario());
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(
      result.analysis.sources.every((source: { rowIds?: string[] }) => !source.rowIds?.length),
    ).toBe(true);
    mocks.loadDashboardDataset.mockClear();
    expect(
      (await post(scenario({ context: { ...scenario().context, entityIds: ['school-hoeng'] } })))
        .status,
    ).toBe(403);
    expect(mocks.loadDashboardDataset).not.toHaveBeenCalled();
  });
});
