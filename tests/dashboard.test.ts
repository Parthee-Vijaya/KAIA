import { describe, expect, it } from 'vitest';
import { CATEGORIES, pupilsForYear, type Dataset } from '../src/domain/data';
import { generateMunicipalBenchmarks } from '../src/domain/municipalities';
import {
  DEFAULT_SCENARIO,
  type AccessContext,
  type Analysis,
  type Area,
  type DemoDocument,
  type Entity,
  type LedgerRow,
  type Period,
} from '../src/domain/types';
import {
  dashboardScenarioSchema,
  parseDashboardQuery,
  type DashboardData,
  type DashboardPanelKey,
  type DashboardQuery,
} from '../src/domain/dashboard';
import {
  buildDashboard,
  buildDashboardScenario,
  resolveDashboardScope,
} from '../src/domain/dashboard-analysis';

const version = 'KAIA-DASHBOARD-FIXTURE-v1';
const areas: Area[] = [
  'schools',
  'facilities',
  'social',
  'health',
  'environment',
  'administration',
  'preparedness',
];
const user: AccessContext = {
  userId: 'fixture-dashboard',
  tenantId: 'fixture-tenant',
  objectId: 'fixture-object',
  roles: ['KAIA.Finance'],
  unitIds: ['*'],
  areas,
  displayName: 'Økonomikonsulent',
  title: 'Økonomikonsulent',
};
function makeDataset(): Dataset {
  const definitions: [string, string, Entity['type'], Area, number?][] = [
    ['school-hoeng', 'Høng Skole', 'school', 'schools', 3],
    ['school-sveboelle', 'Svebølle Skole', 'school', 'schools', 11],
    ['facility-spiralen', 'Spiralen', 'facility', 'facilities'],
    ['facility-hoeng', 'Høng Hallen', 'facility', 'facilities'],
    ['org-social', 'Voksenspecialenheden', 'organisation', 'social'],
    ['org-health', 'Sundhed og Myndighed', 'organisation', 'health'],
    ['org-environment', 'Plan, Byg og Miljø', 'organisation', 'environment'],
    ['org-administration', 'Økonomistaben', 'organisation', 'administration'],
    ['org-preparedness', 'Kalundborg Kommune', 'organisation', 'preparedness'],
    ['committee-schools', 'Børn- og Familieudvalget', 'committee', 'schools'],
  ];
  const entities: Entity[] = definitions.map(([id, name, type, area, pupils]) => ({
    id,
    name,
    type,
    area,
    aliases: [],
    nameSourceUrl: 'https://www.kalundborg.dk/',
    verifiedAt: '2026-10-21',
    synthetic: {
      annualBudgetOre: type === 'committee' ? 0 : 10000000,
      ...(pupils ? { pupils } : {}),
    },
  }));
  const rows: LedgerRow[] = [];
  for (const [index, entity] of entities.filter((entity) => entity.type !== 'committee').entries())
    for (let year = 2020; year <= 2032; year++)
      for (let month = 1; month <= 12; month++)
        for (const [categoryIndex, category] of CATEGORIES.entries())
          for (const kind of ['budget', 'actual', 'forecast'] as const) {
            if (kind === 'actual' && (year > 2026 || (year === 2026 && month > 9))) continue;
            let amountOre =
              (index + 1) * 10003 +
              (year - 2020) * 307 +
              month * 19 +
              categoryIndex * 11 +
              (kind === 'budget' ? 0 : kind === 'actual' ? 103 : 211);
            if (category === 'income') amountOre = -Math.round(amountOre / 10);
            if (
              entity.id === 'school-hoeng' &&
              year === 2026 &&
              kind === 'forecast' &&
              category === 'energy' &&
              month === 10
            )
              amountOre = 1373625;
            rows.push({
              id: `DEMO-L-${entity.id}-${year}-${month}-${category}-${kind}-0`,
              datasetVersion: version,
              entityId: entity.id,
              year,
              month,
              category,
              kind,
              amountOre,
            });
          }
  const demography = Array.from({ length: 13 }, (_, index) => 2020 + index).flatMap((year) =>
    (['0-5', '6-16', '17-64', '65+'] as const).map((ageGroup, index) => ({
      year,
      ageGroup,
      population: [1000, 1400, 5000, 2600][index],
      births: 0,
      deaths: 0,
      domesticNet: 0,
      internationalNet: 0,
      ageIn: 0,
      ageOut: 0,
    })),
  );
  const municipal = generateMunicipalBenchmarks('dashboard-fixture', version, '2026-09-30', {
    structure: { population: 10000, schoolchildren: 14, population65Share: 0.26, rurality: 0.6 },
    structureYear: 2026,
    rows: [],
  });
  const document = (
    id: string,
    entityIds: string[],
    classification: DemoDocument['classification'],
  ): DemoDocument => ({
    id,
    title: 'Simuleret dokument',
    date: '2026-09-30',
    period: '2026',
    type: 'strategy',
    status: 'simulated',
    classification,
    entityIds,
    area: 'schools',
    text: 'SIMULERET MATERIALE. Energi og budgetgrundlag.',
    relatedDocumentIds: [],
    factRefs: [],
    datasetVersion: version,
  });
  return {
    version,
    seed: 'dashboard-fixture',
    referenceDate: '2026-09-30',
    coverage: { fromYear: 2020, toYear: 2032 },
    entities,
    rows,
    documents: [
      document('DEMO-DOC-school-hoeng-strategy', ['school-hoeng'], 'political'),
      document('DEMO-DOC-schools-mixed-note', ['school-hoeng', 'school-sveboelle'], 'internal'),
    ],
    demography,
    municipalities: municipal.municipalities,
    municipalBenchmarks: municipal.municipalBenchmarks,
    municipalMetadata: municipal.metadata,
  };
}
const dataset = makeDataset();
function dashboard(access = user, query: DashboardQuery = {}, data = dataset): DashboardData {
  return buildDashboard(data, access, resolveDashboardScope(access, data, query));
}
function ready(data: DashboardData, key: DashboardPanelKey): Analysis {
  const panel = data.panels[key];
  if (panel.status !== 'ready') throw new Error(`${key}: ${panel.status} ${panel.reason}`);
  return panel.analysis;
}
function expected(
  data: Dataset,
  ids: string[],
  period: Period,
  kind: 'budget' | 'outlook' = 'outlook',
): number {
  return data.rows
    .filter(
      (row) =>
        ids.includes(row.entityId) &&
        row.year === period.year &&
        row.month >= period.fromMonth &&
        row.month <= period.toMonth &&
        row.kind ===
          (kind === 'budget'
            ? 'budget'
            : period.year < 2026 || (period.year === 2026 && row.month <= 9)
              ? 'actual'
              : 'forecast'),
    )
    .reduce((sum, row) => sum + row.amountOre, 0);
}
function exactPercent(amount: number, percentTenths: number): number {
  const n = BigInt(amount) * BigInt(percentTenths) + 500n;
  return Number(n >= 0n ? n / 1000n : -((-n + 999n) / 1000n));
}

describe('Dashboard input and server-derived scope', () => {
  it('defaults from snapshot metadata and server access rather than prototype constants', () => {
    expect(resolveDashboardScope(user, dataset, {})).toEqual({
      area: 'schools',
      entityIds: ['school-hoeng', 'school-sveboelle'],
      period: { year: 2026, fromMonth: 1, toMonth: 9 },
    });
    const shifted = { ...dataset, referenceDate: '2025-04-30' };
    expect(resolveDashboardScope(user, shifted, {}).period).toEqual({
      year: 2025,
      fromMonth: 1,
      toMonth: 4,
    });
    expect(resolveDashboardScope({ ...user, areas: ['facilities'] }, dataset, {}).area).toBe(
      'facilities',
    );
  });
  it('retains explicit same-coverage months and de-duplicates requested units', () => {
    const scope = resolveDashboardScope(
      user,
      dataset,
      parseDashboardQuery(
        new URLSearchParams(
          'area=schools&year=2025&fromMonth=4&toMonth=6&entityId=school-hoeng&entityId=school-hoeng',
        ),
      ),
    );
    expect(scope.period).toEqual({ year: 2025, fromMonth: 4, toMonth: 6 });
    expect(scope.entityIds).toEqual(['school-hoeng']);
  });
  it.each([
    'area=schools&area=facilities',
    'year=2026&year=2025',
    'year=',
    'year=0x7ea',
    'year=2026.5',
    'fromMonth=0',
    'fromMonth=10&toMonth=9',
    'entityId=',
    'datasetVersion=../../private',
    'roles=KAIA.Admin',
    'userId=someone',
    'scope=all',
  ])('rejects ambiguous or untrusted query %s', (query) =>
    expect(() => parseDashboardQuery(new URLSearchParams(query))).toThrow(),
  );
  it('rejects unknown, cross-area, forbidden and empty-identity selections', () => {
    const partial = {
      ...user,
      roles: ['KAIA.DepartmentHead'] as AccessContext['roles'],
      unitIds: ['school-hoeng'],
      areas: ['schools'] as Area[],
    };
    for (const query of [
      { entityIds: ['school-sveboelle'] },
      { entityIds: ['unknown'] },
      { area: 'facilities' as const },
      { entityIds: ['facility-spiralen'] },
    ])
      expect(() => resolveDashboardScope(partial, dataset, query)).toThrow();
    expect(() => resolveDashboardScope({ ...partial, roles: [] }, dataset, {})).toThrow();
    expect(() => resolveDashboardScope({ ...partial, objectId: '' }, dataset, {})).toThrow();
  });
  it('keeps scenario request fields strict, including nested roles and unknown assumptions', () => {
    const input = {
      context: resolveDashboardScope(user, dataset, {}),
      datasetVersion: version,
      assumptions: DEFAULT_SCENARIO,
    };
    expect(dashboardScenarioSchema.safeParse(input).success).toBe(true);
    for (const bad of [
      { ...input, userId: 'other' },
      { ...input, roles: ['KAIA.Admin'] },
      { ...input, context: { ...input.context, role: 'KAIA.Admin' } },
      { ...input, assumptions: { ...DEFAULT_SCENARIO, shell: 'anything' } },
      { ...input, context: { ...input.context, entityIds: [] } },
    ])
      expect(dashboardScenarioSchema.safeParse(bad).success).toBe(false);
  });
});

describe('Dashboard baseline and all derived views use the same permitted snapshot', () => {
  it('reconciles budget, current year, waterfall and heatmap exactly in integer øre', () => {
    const result = dashboard(),
      budget = ready(result, 'budget'),
      year = ready(result, 'year'),
      waterfall = ready(result, 'waterfall'),
      heatmap = ready(result, 'heatmap');
    const ids = result.scope.entityIds,
      period = result.scope.period,
      current = expected(dataset, ids, period),
      plan = expected(dataset, ids, period, 'budget');
    expect(budget.metrics[0].value).toBe(plan);
    expect(budget.metrics[1].value).toBe(current);
    expect(budget.metrics[2].value).toBe(current - plan);
    expect(year.metrics[1].value).toBe(current);
    expect(waterfall.chart!.rows.reduce((sum, row) => sum + Number(row.value), 0)).toBe(
      current - plan,
    );
    expect(
      heatmap.chart!.rows.reduce(
        (sum, row) =>
          sum +
          Object.entries(row)
            .filter(([key]) => key.startsWith('month'))
            .reduce((n, [, value]) => n + Number(value), 0),
        0,
      ),
    ).toBe(current - plan);
    for (const panel of Object.values(result.panels))
      if (panel.status === 'ready') {
        expect(panel.analysis.datasetVersion).toBe(version);
        expect(panel.analysis.sources.every((source) => source.datasetVersion === version)).toBe(
          true,
        );
      }
    expect(result.suggestions).toHaveLength(4);
  });
  it.each(['waterfall', 'heatmap', 'comparison'] as const)(
    'preserves annual budget evidence and gives the %s figure its own citation',
    (key) => {
      const result = dashboard(),
        budget = ready(result, 'budget'),
        analysis = ready(result, key);
      const annualForecast = expected(dataset, result.scope.entityIds, {
        year: 2026,
        fromMonth: 1,
        toMonth: 12,
      });
      const metric = analysis.metrics.find((item) => item.label === 'Årsprognose')!;
      expect(metric.value).toBe(annualForecast);
      expect(metric.sourceIds).toEqual(
        budget.metrics.find((item) => item.label === 'Årsprognose')!.sourceIds,
      );
      const metricSource = analysis.sources.find((source) => metric.sourceIds.includes(source.id))!;
      expect(metricSource.excerpt).toContain('"label":"Årsprognose"');
      expect(metricSource.excerpt).toContain(String(annualForecast));
      expect(analysis.sources.slice(0, budget.sources.length)).toEqual(budget.sources);
      expect(analysis.narrative).toEqual(budget.narrative);
      const figureSource = analysis.sources.find((source) =>
        analysis.chart!.sourceIds.includes(source.id),
      )!;
      expect(figureSource.id).not.toBe(metricSource.id);
      expect(figureSource.excerpt).toContain(JSON.stringify(analysis.chart!.rows));
      const citation = Number(analysis.conclusion.match(/\[(\d+)\]/)?.[1]);
      expect(analysis.sources[citation - 1].id).toBe(figureSource.id);
    },
  );
  it('compares the same selected quarter in both years, never prior full-year against current YTD', () => {
    const result = dashboard(user, { year: 2025, fromMonth: 4, toMonth: 6 }),
      year = ready(result, 'year');
    expect(year.metrics[0].value).toBe(
      expected(dataset, result.scope.entityIds, { year: 2024, fromMonth: 4, toMonth: 6 }),
    );
    expect(year.metrics[1].value).toBe(
      expected(dataset, result.scope.entityIds, { year: 2025, fromMonth: 4, toMonth: 6 }),
    );
    expect(year.context.period).toEqual(result.scope.period);
  });
  it('anchors future projections to snapshot reference and keeps actual and forecast mutually exclusive', () => {
    const result = dashboard(user, { year: 2025 }),
      forecast = ready(result, 'forecast'),
      rows = forecast.chart!.rows;
    expect(forecast.context.period).toEqual({ year: 2026, fromMonth: 1, toMonth: 12 });
    expect(rows.map((row) => row.label)).toEqual([
      '2026',
      '2027',
      '2028',
      '2029',
      '2030',
      '2031',
      '2032',
    ]);
    expect(Number(rows[0].actual) + Number(rows[0].forecast)).toBe(rows[0].base);
    expect(rows.slice(1).every((row) => row.actual === null && row.forecast === row.base)).toBe(
      true,
    );
  });
  it('uses the correct annual pupil denominator and weighted period ratio for peers', () => {
    const result = dashboard(),
      peer = ready(result, 'peer'),
      normalized = ready(result, 'perPupil'),
      forecast = ready(result, 'forecast');
    const schools = dataset.entities.filter((entity) => result.scope.entityIds.includes(entity.id));
    const pupils = schools.reduce((sum, entity) => sum + pupilsForYear(entity, 2026), 0);
    expect(peer.metrics[0].value).toBe(
      Math.round(expected(dataset, result.scope.entityIds, result.scope.period) / pupils),
    );
    expect(normalized.chart!.rows[0].base).toBe(
      Math.round(Number(forecast.chart!.rows[0].base) / pupils),
    );
    const naiveAverage =
      schools.reduce(
        (sum, entity) =>
          sum + expected(dataset, [entity.id], result.scope.period) / pupilsForYear(entity, 2026),
        0,
      ) / schools.length;
    expect(peer.metrics[0].value).not.toBe(Math.round(naiveAverage));
  });
  it.each(areas)('supports authorized %s with real area labels and valid normalization', (area) => {
    const result = dashboard(user, { area });
    expect(ready(result, 'budget').context.area).toBe(area);
    expect(ready(result, 'waterfall').context.area).toBe(area);
    expect(ready(result, 'heatmap').chart!.rows.length).toBe(
      dataset.entities.filter((entity) => entity.area === area && entity.type !== 'committee')
        .length,
    );
    expect(ready(result, 'peer').context.metric).toBe(
      area === 'schools' ? 'perPupil' : 'perCapita',
    );
    if (area !== 'schools') expect(result.panels.perPupil.status).toBe('unsupported');
  });
  it('marks a missing prior year and incomplete future snapshot without inventing zero values', () => {
    const earliest = dashboard(user, { year: 2020 });
    expect(earliest.panels.budget.status).toBe('ready');
    expect(earliest.panels.year.status).toBe('missing');
    const old = {
      ...dataset,
      coverage: { fromYear: 2020, toYear: 2028 },
      rows: dataset.rows.filter((row) => row.year <= 2028),
    };
    const result = dashboard(user, {}, old);
    expect(result.panels.budget.status).toBe('ready');
    expect(result.panels.forecast.status).toBe('missing');
  });
  it.each([0, undefined])(
    'marks every pupil-normalized panel missing when one school has invalid pupil count %s',
    (pupils) => {
      const withoutPupils = {
        ...dataset,
        entities: dataset.entities.map((entity) =>
          entity.id === 'school-hoeng'
            ? { ...entity, synthetic: { ...entity.synthetic, pupils } }
            : entity,
        ),
      };
      const result = dashboard(user, {}, withoutPupils);
      expect(result.panels.budget.status).toBe('ready');
      expect(result.panels.forecast.status).toBe('ready');
      expect(result.panels.perPupil.status).toBe('missing');
      expect(result.panels.comparison.status).toBe('missing');
      expect(result.panels.peer.status).toBe('missing');
    },
  );
  it('does not turn missing budget/actual categories into a successful zero or understated total', () => {
    const incomplete = {
      ...dataset,
      rows: dataset.rows.filter(
        (row) =>
          !(
            row.entityId === 'school-hoeng' &&
            row.year === 2026 &&
            row.month === 9 &&
            row.category === 'maintenance' &&
            row.kind === 'actual'
          ),
      ),
    };
    const result = dashboard(user, {}, incomplete);
    expect(result.panels.budget.status).toBe('missing');
    const bothAbsent = {
      ...dataset,
      rows: dataset.rows.filter(
        (row) =>
          !(
            row.entityId === 'school-hoeng' &&
            row.year === 2029 &&
            row.month === 4 &&
            row.category === 'activity'
          ),
      ),
    };
    expect(dashboard(user, {}, bothAbsent).panels.forecast.status).toBe('missing');
  });
  it('does not attach real-regnskab labels to future-year outlook values', () => {
    const result = dashboard(user, { year: 2028 }),
      budget = ready(result, 'budget'),
      year = ready(result, 'year');
    expect(budget.metrics[1].value).toBe(
      expected(dataset, result.scope.entityIds, result.scope.period),
    );
    expect(budget.metrics[1].label).not.toMatch(/realiseret|til dato/i);
    expect(year.metrics.slice(0, 2).every((metric) => /prognose/i.test(metric.label))).toBe(true);
  });
});

describe('Dashboard authorization and private scope', () => {
  it('uses a partial institution grant without scaling it to a whole municipal benchmark', () => {
    const partial: AccessContext = {
      ...user,
      roles: ['KAIA.DepartmentHead'],
      areas: ['schools'],
      unitIds: ['school-hoeng'],
    };
    const result = dashboard(partial);
    expect(result.scope.entityIds).toEqual(['school-hoeng']);
    expect(result.capabilities.municipalBenchmark).toBe(false);
    expect(result.panels.peer.status).not.toBe('ready');
    expect(ready(result, 'budget').metrics[1].value).toBe(
      expected(dataset, ['school-hoeng'], result.scope.period),
    );
    for (const panel of Object.values(result.panels))
      if (panel.status === 'ready') {
        expect(panel.analysis.context.entityIds).toEqual(['school-hoeng']);
        expect(
          panel.analysis.sources.every(
            (source) => !source.rowIds?.some((id) => id.includes('school-sveboelle')),
          ),
        ).toBe(true);
        expect(
          panel.analysis.sources.every(
            (source) => source.documentId !== 'DEMO-DOC-schools-mixed-note',
          ),
        ).toBe(true);
      }
  });
  it('lets Council use area aggregates and political sources while suppressing unit detail', () => {
    const council: AccessContext = {
      ...user,
      roles: ['KAIA.Council'],
      areas: ['schools'],
      unitIds: ['committee-schools'],
    };
    const result = dashboard(council);
    expect(result.capabilities.detail).toBe(false);
    expect(result.panels.heatmap.status).toBe('unsupported');
    expect(result.panels.comparison.status).toBe('unsupported');
    for (const key of ['budget', 'year', 'forecast', 'waterfall', 'peer'] as const) {
      const analysis = ready(result, key);
      expect(analysis.sources.every((source) => !source.rowIds?.length)).toBe(true);
      expect(
        analysis.sources.every((source) => source.documentId !== 'DEMO-DOC-schools-mixed-note'),
      ).toBe(true);
    }
    expect(() => dashboard(council, { entityIds: ['school-hoeng'] })).toThrow();
  });
  it('reacts to supplied dataset changes and cannot silently use prototype JSON/global seed fallback', () => {
    const modified = {
      ...dataset,
      version: 'KAIA-DASHBOARD-FIXTURE-v2',
      rows: dataset.rows.map((row) => ({
        ...row,
        datasetVersion: 'KAIA-DASHBOARD-FIXTURE-v2',
        amountOre:
          row.kind === 'actual' &&
          row.entityId === 'school-hoeng' &&
          row.year === 2026 &&
          row.month === 9 &&
          row.category === 'salary'
            ? row.amountOre + 12345
            : row.amountOre,
      })),
      documents: [],
      municipalBenchmarks: [],
    };
    const before = ready(dashboard(), 'budget').metrics[1].value,
      after = ready(dashboard(user, {}, modified), 'budget');
    expect(after.datasetVersion).toBe(modified.version);
    expect(after.metrics[1].value).toBe(before + 12345);
  });
  it('rejects mixed versions and unsafe ledger amounts before emitting derived charts', () => {
    expect(() => resolveDashboardScope(user, dataset, { datasetVersion: 'KAIA-OTHER-v1' })).toThrow(
      /dataversion/,
    );
    for (const changed of [
      { datasetVersion: 'KAIA-OTHER-v1' },
      { amountOre: 1.5 },
      { amountOre: Number.MAX_SAFE_INTEGER + 1 },
    ]) {
      const invalid = {
        ...dataset,
        rows: dataset.rows.map((row) =>
          row.entityId === 'school-hoeng' &&
          row.year === 2026 &&
          row.month === 9 &&
          row.category === 'salary' &&
          row.kind === 'actual'
            ? { ...row, ...changed }
            : row,
        ),
      };
      expect(() => dashboard(user, {}, invalid)).toThrow();
    }
  });
});

describe('Dashboard scenario recomputation and immutable baseline', () => {
  it('changes only remaining forecast energy postings and sums rounded contributions exactly', () => {
    const scope = resolveDashboardScope(user, dataset, {}),
      before = JSON.stringify(dataset),
      assumptions = { ...DEFAULT_SCENARIO, energyPercent: 15 };
    const analysis = buildDashboardScenario(dataset, user, scope, assumptions);
    const expectedDelta = dataset.rows
      .filter(
        (row) =>
          scope.entityIds.includes(row.entityId) &&
          row.year === 2026 &&
          row.month > 9 &&
          row.kind === 'forecast' &&
          row.category === 'energy',
      )
      .reduce((sum, row) => sum + Math.round(row.amountOre * 0.15), 0);
    expect(analysis.scenario!.deltaOre).toBe(expectedDelta);
    expect(analysis.scenario!.scenarioOre - analysis.scenario!.baselineOre).toBe(expectedDelta);
    expect(JSON.stringify(dataset)).toBe(before);
    expect(buildDashboardScenario(dataset, user, scope, DEFAULT_SCENARIO).scenario!.deltaOre).toBe(
      0,
    );
  });
  it('handles fractional negative half-ties in exact øre rather than binary floating error', () => {
    const scope = resolveDashboardScope(user, dataset, {}),
      assumptions = { ...DEFAULT_SCENARIO, energyPercent: -23.6 };
    const expectedDelta = dataset.rows
      .filter(
        (row) =>
          scope.entityIds.includes(row.entityId) &&
          row.year === 2026 &&
          row.month > 9 &&
          row.kind === 'forecast' &&
          row.category === 'energy',
      )
      .reduce((sum, row) => sum + exactPercent(row.amountOre, -236), 0);
    expect(buildDashboardScenario(dataset, user, scope, assumptions).scenario!.deltaOre).toBe(
      expectedDelta,
    );
  });
  it('combines category effects once, limits pupil changes to variable activity costs and changes the budget separately', () => {
    const scope = resolveDashboardScope(user, dataset, {});
    const assumptions = {
      ...DEFAULT_SCENARIO,
      energyPercent: 15,
      salaryPercent: 2,
      substitutePercent: -10,
      pupilsPercent: 5,
      maintenancePercent: -12,
      budgetPercent: -3,
    };
    const selected = dataset.rows.filter(
      (row) => scope.entityIds.includes(row.entityId) && row.year === 2026,
    );
    const rates = {
      energy: 150,
      salary: 20,
      substitute: -100,
      activity: 14,
      maintenance: -120,
      income: 0,
    };
    const delta = selected
      .filter((row) => row.month > 9 && row.kind === 'forecast')
      .reduce((sum, row) => sum + exactPercent(row.amountOre, rates[row.category]), 0);
    const budget = selected
      .filter((row) => row.kind === 'budget')
      .reduce((sum, row) => sum + row.amountOre, 0);
    const budgetDelta = selected
      .filter((row) => row.kind === 'budget' && row.month > 9)
      .reduce((sum, row) => sum + exactPercent(row.amountOre, -30), 0);
    const result = buildDashboardScenario(dataset, user, scope, assumptions);
    expect(result.scenario!.deltaOre).toBe(delta);
    expect(result.metrics[3].value).toBe(budget + budgetDelta);
    expect(
      result.chart!.rows.reduce((sum, row) => sum + Number(row.scenario) - Number(row.baseline), 0),
    ).toBe(delta);
    expect(result.chart!.rows.slice(0, 9).every((row) => row.baseline === row.scenario)).toBe(true);
  });
  it('rejects remaining-year effects in an already closed year with an explicit reason', () => {
    const scope = resolveDashboardScope(user, dataset, { year: 2025 });
    expect(() =>
      buildDashboardScenario(dataset, user, scope, { ...DEFAULT_SCENARIO, energyPercent: 15 }),
    ).toThrow(/ingen resterende prognosemåneder|historisk/i);
  });
  it('keeps full-year sensitivity separate and enforces scope again for scenario calls', () => {
    const scope = resolveDashboardScope(user, dataset, {});
    const remaining = buildDashboardScenario(dataset, user, scope, {
      ...DEFAULT_SCENARIO,
      energyPercent: 15,
    });
    const annual = buildDashboardScenario(dataset, user, scope, {
      ...DEFAULT_SCENARIO,
      energyPercent: 15,
      horizon: 'annual',
    });
    expect(annual.scenario!.deltaOre).toBeGreaterThan(remaining.scenario!.deltaOre);
    expect(() =>
      buildDashboardScenario(
        dataset,
        { ...user, areas: ['schools'], unitIds: ['school-hoeng'] },
        { ...scope, entityIds: ['school-sveboelle'] },
        DEFAULT_SCENARIO,
      ),
    ).toThrow();
  });
});
