import { describe, expect, it } from 'vitest';
import { analyze } from '../src/domain/analysis';
import { CATEGORIES, CATEGORY_LABELS, type Dataset } from '../src/domain/data';
import { buildDashboard, resolveDashboardScope } from '../src/domain/dashboard-analysis';
import { AccessDeniedError } from '../src/domain/policy';
import {
  DEFAULT_SCENARIO,
  type AccessContext,
  type Analysis,
  type AnalysisContext,
  type Category,
  type DemoDocument,
  type Entity,
  type LedgerRow,
  type Period,
} from '../src/domain/types';

const version = 'KAIA-SCHOOL-DRILLDOWN-FIXTURE-v1';
const access: AccessContext = {
  userId: 'school-drilldown-fixture',
  tenantId: 'fixture-tenant',
  objectId: 'fixture-object',
  roles: ['KAIA.Finance'],
  areas: ['schools', 'facilities'],
  unitIds: ['*'],
  displayName: 'Økonomikonsulent',
  title: 'Økonomikonsulent',
};
const definitions: [string, string, Entity['type'], Entity['area'], number?][] = [
  ['school-hoeng', 'Høng Skole', 'school', 'schools', 321],
  ['school-sveboelle', 'Svebølle Skole', 'school', 'schools', 183],
  ['facility-spiralen', 'Spiralen', 'facility', 'facilities'],
  ['committee-schools', 'Børn- og Familieudvalget', 'committee', 'schools'],
];
function makeDataset(): Dataset {
  const entities: Entity[] = definitions.map(([id, name, type, area, pupils]) => ({
    id,
    name,
    type,
    area,
    aliases: [],
    nameSourceUrl: 'https://www.kalundborg.dk/',
    verifiedAt: '2026-10-21',
    synthetic: { annualBudgetOre: 10000000, ...(pupils ? { pupils } : {}) },
  }));
  const rows: LedgerRow[] = [];
  for (const [index, entity] of entities.filter((entity) => entity.type !== 'committee').entries())
    for (let year = 2025; year <= 2027; year++)
      for (let month = 1; month <= 12; month++)
        for (const [categoryIndex, category] of CATEGORIES.entries())
          for (const kind of ['budget', 'actual', 'forecast'] as const) {
            if (kind === 'actual' && (year > 2026 || (year === 2026 && month > 9))) continue;
            const base =
              (index + 1) * 100003 + (year - 2025) * 1009 + categoryIndex * 71 + month * 17;
            const direction = entity.id === 'school-sveboelle' ? -1 : 1;
            const change =
              kind === 'budget'
                ? 0
                : direction *
                  (61 + categoryIndex * 13 + month * 5 + (kind === 'forecast' ? 37 : 0));
            const amountOre =
              category === 'income' ? -Math.round(base / 12) - change : base + change;
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
  const documents: DemoDocument[] = entities
    .filter((entity) => entity.type === 'school')
    .map((entity) => ({
      id: `DEMO-DOC-${entity.id}-2026-followup`,
      title: `Simuleret budgetopfølgning · ${entity.name}`,
      date: '2026-09-30',
      period: '2026',
      type: 'followup',
      status: 'simulated',
      classification: 'internal',
      entityIds: [entity.id],
      area: 'schools',
      text: 'SIMULERET MATERIALE. Kontoopgørelsen beskriver beløbsbidrag; en bestemt økonomisk årsag er ikke dokumenteret i denne fixture.',
      relatedDocumentIds: [],
      factRefs: [],
      datasetVersion: version,
    }));
  return {
    version,
    seed: 'school-drilldown-fixture',
    referenceDate: '2026-09-30',
    coverage: { fromYear: 2025, toYear: 2027 },
    entities,
    rows,
    documents,
  };
}
const dataset = makeDataset();
const schools = dataset.entities.filter((entity) => entity.type === 'school');
const periods: Period[] = [
  { year: 2025, fromMonth: 4, toMonth: 6 },
  { year: 2026, fromMonth: 1, toMonth: 9 },
  { year: 2026, fromMonth: 7, toMonth: 12 },
  { year: 2027, fromMonth: 1, toMonth: 12 },
];
const previousContexts: AnalysisContext[] = [
  {
    area: 'schools',
    entityIds: schools.map((entity) => entity.id),
    period: periods[0],
    intent: 'comparison',
    metric: 'perPupil',
  },
  {
    area: 'schools',
    entityIds: schools.map((entity) => entity.id),
    period: periods[0],
    intent: 'yearComparison',
    metric: 'perPupil',
    comparison: { kind: 'year', year: 2024 },
  },
  {
    area: 'schools',
    entityIds: schools.map((entity) => entity.id),
    period: periods[0],
    intent: 'scenario',
    metric: 'energy',
    scenario: { ...DEFAULT_SCENARIO, energyPercent: 15 },
  },
];
function question(entity: Entity) {
  return `Hvilke udgiftstyper bidrager til nettoafvigelsen på ${entity.name}?`;
}
function clickContext(entity: Entity, period: Period): AnalysisContext {
  return { area: 'schools', entityIds: [entity.id], period, metric: 'net', intent: 'category' };
}
function variance(entityId: string, period: Period, category?: Category) {
  const inPeriod = dataset.rows.filter(
    (row) =>
      row.entityId === entityId &&
      row.year === period.year &&
      row.month >= period.fromMonth &&
      row.month <= period.toMonth &&
      (!category || row.category === category),
  );
  const selected = inPeriod.filter(
    (row) =>
      row.kind ===
      (period.year < 2026 || (period.year === 2026 && row.month <= 9) ? 'actual' : 'forecast'),
  );
  return (
    selected.reduce((sum, row) => sum + row.amountOre, 0) -
    inPeriod.filter((row) => row.kind === 'budget').reduce((sum, row) => sum + row.amountOre, 0)
  );
}
function comparison(period: Period, user = access) {
  const scope = resolveDashboardScope(user, dataset, { area: 'schools', ...period });
  const panel = buildDashboard(dataset, user, scope).panels.comparison;
  if (panel.status !== 'ready') throw new Error(`Comparison unavailable: ${panel.reason}`);
  return panel.analysis;
}
function assertSchoolEvidence(result: Analysis, entity: Entity, period: Period) {
  expect(result.datasetVersion).toBe(version);
  const sourceIds = new Set(result.sources.map((source) => source.id));
  expect(result.chart!.sourceIds.every((id) => sourceIds.has(id))).toBe(true);
  expect(result.metrics.every((metric) => metric.sourceIds.every((id) => sourceIds.has(id)))).toBe(
    true,
  );
  const rowIds = result.sources.flatMap((source) => source.rowIds || []);
  expect(rowIds.length).toBeGreaterThan(0);
  const rowMap = new Map(dataset.rows.map((row) => [row.id, row]));
  for (const id of rowIds) {
    const row = rowMap.get(id)!;
    expect(row.entityId).toBe(entity.id);
    expect(row.datasetVersion).toBe(version);
    expect(row.year).toBe(period.year);
    expect(row.month).toBeGreaterThanOrEqual(period.fromMonth);
    expect(row.month).toBeLessThanOrEqual(period.toMonth);
  }
  for (const source of result.sources.filter((source) => source.documentId))
    expect(
      dataset.documents.find((document) => document.id === source.documentId)!.entityIds,
    ).toEqual([entity.id]);
}

describe('skoleklik bevarer den præcise afvigelse fra Fremblik', () => {
  it.each(periods)(
    'afstemmer begge skolers rå afvigelse og seks kontobidrag for $year måned $fromMonth–$toMonth',
    (period) => {
      const overview = comparison(period);
      for (const entity of schools) {
        const row = overview.chart!.rows.find((row) => row.label === entity.name)!;
        const result = analyze(
          question(entity),
          access,
          undefined,
          clickContext(entity, period),
          dataset,
        );
        expect(row.variance).toBe(variance(entity.id, period));
        expect(Number.isSafeInteger(row.variance)).toBe(true);
        expect(row.variance).not.toBe(Number(row.actual) - Number(row.budget));
        expect(result.context).toMatchObject(clickContext(entity, period));
        expect(result.chart!.type).toBe('waterfall');
        expect(result.chart!.rows).toHaveLength(CATEGORIES.length);
        expect(result.chart!.rows.reduce((sum, row) => sum + Number(row.value), 0)).toBe(
          row.variance,
        );
        let running = 0;
        for (const category of CATEGORIES) {
          const contribution = result.chart!.rows.find(
            (row) => row.label === CATEGORY_LABELS[category],
          )!;
          expect(contribution.value).toBe(variance(entity.id, period, category));
          expect(contribution.start).toBe(running);
          running += Number(contribution.value);
        }
        assertSchoolEvidence(result, entity, period);
      }
    },
  );
  it.each(previousContexts)(
    'nulstiller tidligere $intent/$metric uden at ændre klikperioden eller genbruge en anden skoles tal',
    (previous) => {
      const period = periods[2],
        entity = schools[1];
      const overview = comparison(period);
      const result = analyze(
        question(entity),
        access,
        previous,
        clickContext(entity, period),
        dataset,
      );
      expect(result.context).toMatchObject({
        intent: 'category',
        metric: 'net',
        entityIds: [entity.id],
        area: 'schools',
        period,
      });
      expect(result.context.comparison).toBeUndefined();
      expect(result.context.scenario).toBeUndefined();
      expect(result.scenario).toBeUndefined();
      const expected = overview.chart!.rows.find((row) => row.label === entity.name)!.variance;
      expect(Number(expected)).toBeLessThan(0);
      expect(result.chart!.rows.reduce((sum, row) => sum + Number(row.value), 0)).toBe(expected);
      assertSchoolEvidence(result, entity, period);
    },
  );
  it('bruger regnskab før reference og prognose efter reference præcis én gang i et blandet halvår', () => {
    const period = periods[2],
      entity = schools[0];
    const result = analyze(
      question(entity),
      access,
      undefined,
      clickContext(entity, period),
      dataset,
    );
    const selected = dataset.rows.filter(
      (row) => row.entityId === entity.id && row.year === 2026 && row.month >= 7,
    );
    const actual = selected
      .filter((row) => row.kind === 'actual')
      .reduce((sum, row) => sum + row.amountOre, 0);
    const forecast = selected
      .filter((row) => row.kind === 'forecast' && row.month > 9)
      .reduce((sum, row) => sum + row.amountOre, 0);
    const budget = selected
      .filter((row) => row.kind === 'budget')
      .reduce((sum, row) => sum + row.amountOre, 0);
    expect(actual).toBeGreaterThan(0);
    expect(forecast).toBeGreaterThan(0);
    expect(result.metrics[1].value).toBe(actual + forecast);
    expect(result.chart!.rows.reduce((sum, row) => sum + Number(row.value), 0)).toBe(
      actual + forecast - budget,
    );
  });
  it('beskriver økonomiske bidrag uden at opfinde en dokumenteret årsag, når dokumenter mangler', () => {
    const result = analyze(
      question(schools[0]),
      access,
      undefined,
      clickContext(schools[0], periods[1]),
      { ...dataset, documents: [] },
    );
    expect(result.context.intent).toBe('category');
    expect(result.chart!.type).toBe('waterfall');
    expect(result.conclusion).toMatch(/bidrager|summerer/);
    expect([result.conclusion, ...result.narrative].join(' ')).not.toMatch(
      /skyldes|forårsaget af|dokumenteret årsag/i,
    );
    expect(result.sources.every((source) => !source.documentId)).toBe(true);
    expect(result.sources[0].type).toBe('demo');
    expect(result.sources[0].excerpt).toMatch(/SIMULEREDE TAL/);
  });
});

describe('skoleklik genkontrollerer sessionens rolle og enhedsscope', () => {
  it('afviser Council institutionsopslag selv med et gyldigt områdescope', () => {
    const council: AccessContext = {
      ...access,
      roles: ['KAIA.Council'],
      areas: ['schools'],
      unitIds: ['committee-schools'],
    };
    const scope = resolveDashboardScope(council, dataset, { area: 'schools', ...periods[1] });
    expect(buildDashboard(dataset, council, scope).panels.comparison.status).toBe('unsupported');
    expect(() =>
      analyze(
        question(schools[0]),
        council,
        undefined,
        clickContext(schools[0], periods[1]),
        dataset,
      ),
    ).toThrow(AccessDeniedError);
  });
  it('viser og forklarer kun den eksplicit tilladte skole for en fagchef', () => {
    const partial: AccessContext = {
      ...access,
      roles: ['KAIA.DepartmentHead'],
      areas: ['schools'],
      unitIds: [schools[0].id],
    };
    const overview = comparison(periods[1], partial);
    expect(overview.chart!.rows.map((row) => row.label)).toEqual([schools[0].name]);
    const permitted = analyze(
      question(schools[0]),
      partial,
      undefined,
      clickContext(schools[0], periods[1]),
      dataset,
    );
    assertSchoolEvidence(permitted, schools[0], periods[1]);
    expect(() =>
      analyze(
        question(schools[1]),
        partial,
        undefined,
        clickContext(schools[1], periods[1]),
        dataset,
      ),
    ).toThrow(AccessDeniedError);
    expect(() =>
      analyze(
        question(schools[0]),
        { ...partial, areas: ['facilities'] },
        undefined,
        clickContext(schools[0], periods[1]),
        dataset,
      ),
    ).toThrow(AccessDeniedError);
  });
});
